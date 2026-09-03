/**
 * Executable security-surface proof for issue #74 fail-closed repair.
 *
 * Positive and negative controls driven through the BUILT artifacts
 * (packages/db dist, apps/collector dist) — not vitest mocks — using an
 * in-memory adapter. Exits non-zero on any failure.
 *
 * Run: node verification/builder/issue74-smtp-fail-closed.proof.mjs
 */
import assert from 'node:assert/strict';
import { ProbeObservationRepository } from '../../packages/db/dist/index.js';
import {
  persistProbeObservations,
  smtpResultToObservation,
} from '../../apps/collector/dist/probes/persist-observations.js';

// Minimal in-memory IDatabaseAdapter: selectWhere/selectOne/select/insertMany.
const makeAdapter = (rows) => {
  const rowIds = new Set(rows.map((r) => r.id));
  // Drizzle eq() conditions are cyclic graphs; bound the walk (like the test
  // harness) to extract the id value for selectOne.
  const idFromCondition = (v, depth = 0, seen = new Set()) => {
    if (typeof v === 'string' && rowIds.has(v)) return v;
    if (v === null || typeof v !== 'object' || depth > 6 || seen.has(v)) return null;
    seen.add(v);
    for (const value of Object.values(v)) {
      const hit = idFromCondition(value, depth + 1, seen);
      if (hit) return hit;
    }
    return null;
  };
  return {
    async selectWhere(_table, condition) {
      // Negative control: the snapshot predicate must still reference snapshotId.
      const seen = new Set();
      const walk = (v, depth = 0) => {
        if (v === null || typeof v !== 'object' || depth > 6 || seen.has(v)) return;
        seen.add(v);
        for (const value of Object.values(v)) {
          if (value === 'snapshot-1') seen.add('found');
          else walk(value, depth + 1);
        }
      };
      walk(condition);
      assert.ok(seen.has('found'), 'selectWhere must filter on snapshotId');
      return structuredClone(rows);
    },
    async selectOne(_table, condition) {
      const id = idFromCondition(condition);
      const row = id ? (rows.find((r) => r.id === id) ?? null) : null;
      return row ? structuredClone(row) : null;
    },
    async select() {
      return structuredClone(rows);
    },
    async insertMany(_table, data) {
      return structuredClone(data);
    },
  };
};

const trustedCert = {
  subject: 'mx.example.com',
  issuer: 'Test CA',
  validFrom: '2026-01-01',
  validTo: '2027-01-01',
  fingerprint: 'AA:BB:CC:DD',
  chainAuthorized: true,
  hostnameAuthorized: true,
};

const row = (id, probeData, extra = {}) => ({
  id,
  snapshotId: 'snapshot-1',
  probeType: 'smtp_starttls',
  status: 'success',
  hostname: `mx-${id}.example.com`,
  port: 25,
  success: true,
  errorMessage: null,
  probedAt: new Date('2026-09-01T00:00:00Z'),
  responseTimeMs: 100,
  probeData,
  ...extra,
});

const rows = [
  row('trusted', {
    supportsStarttls: true,
    tlsNegotiated: true,
    tlsTrusted: true,
    certificate: trustedCert,
  }),
  row('forged-tlstrusted-no-cert', {
    supportsStarttls: true,
    tlsNegotiated: true,
    tlsTrusted: true, // forged: no certificate evidence at all
  }),
  row('forged-chain-false', {
    supportsStarttls: true,
    tlsNegotiated: true,
    tlsTrusted: true,
    certificate: { ...trustedCert, chainAuthorized: false },
  }),
  row('forged-hostname-false', {
    supportsStarttls: true,
    tlsNegotiated: true,
    tlsTrusted: true,
    certificate: { ...trustedCert, hostnameAuthorized: false },
  }),
  row('legacy-null-probedata', null),
  row('genuine-timeout', { supportsStarttls: false, tlsNegotiated: false, tlsTrusted: false }, {
    success: false,
    status: 'timeout',
    errorMessage: 'Connection timed out',
  }),
  // Forged SMTP row whose response time sits exactly at the slow threshold.
  row('forged-at-threshold', {
    supportsStarttls: true,
    tlsNegotiated: true,
    tlsTrusted: true, // forged: no certificate evidence at all
  }, { responseTimeMs: 500 }),
  // Legacy SMTP row with null timing (excluded from slow probes).
  row('legacy-null-timing', null, { responseTimeMs: null }),
  // Legacy SMTP row probed outside the time range under test.
  row('legacy-out-of-range', null, { probedAt: new Date('2026-08-31T00:00:00Z') }),
  {
    id: 'mtasts-success',
    snapshotId: 'snapshot-1',
    probeType: 'mta_sts',
    status: 'success',
    hostname: 'mta-sts.example.com',
    port: 443,
    success: true,
    errorMessage: null,
    probedAt: new Date('2026-09-01T00:00:00Z'),
    responseTimeMs: 100,
    probeData: null,
  },
  {
    id: 'mtasts-failed',
    snapshotId: 'snapshot-1',
    probeType: 'mta_sts',
    status: 'error',
    hostname: 'mta-sts2.example.com',
    port: 443,
    success: false,
    errorMessage: 'TLS handshake failed',
    probedAt: new Date('2026-09-01T00:00:00Z'),
    responseTimeMs: 100,
    probeData: null,
  },
];

const adapterRowsSnapshot = structuredClone(rows);
const repo = new ProbeObservationRepository(makeAdapter(rows));

// --- findBySnapshotId: untrusted SMTP success reads as error -------------
const snapshot = await repo.findBySnapshotId('snapshot-1');
const byId = Object.fromEntries(snapshot.map((r) => [r.id, r]));

// Positive control: trusted row and non-SMTP row survive untouched.
assert.equal(byId.trusted.success, true, 'trusted SMTP row must read success');
assert.equal(byId.trusted.status, 'success');
assert.equal(byId['mtasts-success'].success, true, 'non-SMTP row must be untouched');

// Negative controls: every forged/legacy SMTP row fails closed.
for (const id of [
  'forged-tlstrusted-no-cert',
  'forged-chain-false',
  'forged-hostname-false',
  'legacy-null-probedata',
]) {
  assert.equal(byId[id].success, false, `${id} must read success:false`);
  assert.equal(byId[id].status, 'error', `${id} must read status:error`);
}

// Genuine failure keeps its raw status; diagnostics preserved byte-for-byte.
assert.equal(byId['genuine-timeout'].status, 'timeout');
assert.deepEqual(
  byId['forged-chain-false'].probeData.certificate,
  { ...trustedCert, chainAuthorized: false },
  'certificate diagnostics must be preserved on normalized reads'
);

// --- findSuccessfulSmtpProbes: full trust contract required -------------
const successful = await repo.findSuccessfulSmtpProbes('snapshot-1');
assert.deepEqual(
  successful.map((r) => r.id),
  ['trusted'],
  'only the fully trusted SMTP row may appear as successful'
);

// --- countByStatus / getSummary: no inflated success --------------------
const counts = await repo.countByStatus('snapshot-1');
assert.deepEqual(counts, {
  success: 2, // trusted SMTP + MTA-STS
  timeout: 1, // genuine SMTP timeout keeps its raw bucket
  refused: 0,
  error: 8, // 4 forged + 3 legacy SMTP rows + failed MTA-STS
  other: 0,
});

const summary = await repo.getSummary('snapshot-1');
assert.equal(summary.total, 11, 'total unchanged');
assert.equal(summary.successful, 2, 'summary counts only effective success');
assert.equal(summary.failed, 9);
assert.deepEqual(summary.byType, { smtp_starttls: 9, mta_sts: 2 });

// Contradictory status control: complete trust evidence cannot override a
// persisted failure status, and the raw status/diagnostics survive reads.
const contradictoryStatus = row(
  'contradictory-success-timeout',
  {
    supportsStarttls: true,
    tlsNegotiated: true,
    tlsTrusted: true,
    certificate: trustedCert,
  },
  { status: 'timeout', errorMessage: 'Connection timed out' }
);
const contradictoryRepo = new ProbeObservationRepository(makeAdapter([contradictoryStatus]));
const contradictoryById = await contradictoryRepo.findById(contradictoryStatus.id);
assert.equal(contradictoryById.success, false);
assert.equal(contradictoryById.status, 'timeout');
assert.equal(contradictoryById.errorMessage, 'Connection timed out');
assert.deepEqual(contradictoryById.probeData, contradictoryStatus.probeData);
assert.deepEqual(
  await contradictoryRepo.findSuccessfulSmtpProbes('snapshot-1'),
  [],
  'contradictory timeout must not appear as a successful SMTP probe'
);
const contradictoryFailed = await contradictoryRepo.findFailedProbes('snapshot-1');
assert.deepEqual(contradictoryFailed.map((r) => r.id), [contradictoryStatus.id]);
assert.equal(contradictoryFailed[0].status, 'timeout');
assert.deepEqual(await contradictoryRepo.countByStatus('snapshot-1'), {
  success: 0,
  timeout: 1,
  refused: 0,
  error: 0,
  other: 0,
});
assert.deepEqual(await contradictoryRepo.getSummary('snapshot-1'), {
  total: 1,
  successful: 0,
  failed: 1,
  byType: { smtp_starttls: 1 },
  avgResponseTimeMs: 100,
});

// --- findById: single-row reads fail closed, missing stays null ---------
const forgedById = await repo.findById('forged-chain-false');
assert.equal(forgedById.id, 'forged-chain-false');
assert.equal(forgedById.success, false, 'findById must normalize forged SMTP');
assert.equal(forgedById.status, 'error');
assert.deepEqual(
  forgedById.probeData.certificate,
  { ...trustedCert, chainAuthorized: false },
  'findById preserves certificate diagnostics'
);

const trustedById = await repo.findById('trusted');
assert.equal(trustedById.success, true, 'trusted SMTP row reads success via findById');
assert.equal(trustedById.status, 'success');

const mtastsById = await repo.findById('mtasts-success');
assert.equal(mtastsById.success, true, 'non-SMTP row untouched by findById');
assert.equal(mtastsById.status, 'success');

assert.equal(await repo.findById('does-not-exist'), null, 'missing id must return null');

// --- findBySnapshotAndType: type filter + hostname sort + normalize -----
const smtpByType = await repo.findBySnapshotAndType('snapshot-1', 'smtp_starttls');
assert.deepEqual(
  smtpByType.map((r) => r.id),
  [
    'forged-at-threshold',
    'forged-chain-false',
    'forged-hostname-false',
    'forged-tlstrusted-no-cert',
    'genuine-timeout',
    'legacy-null-probedata',
    'legacy-null-timing',
    'legacy-out-of-range',
    'trusted',
  ],
  'findBySnapshotAndType keeps type filter and hostname sort'
);
for (const r of smtpByType) {
  if (r.id === 'trusted') {
    assert.equal(r.success, true);
  } else if (r.id === 'genuine-timeout') {
    assert.equal(r.success, false);
    assert.equal(r.status, 'timeout', 'raw timeout status preserved');
  } else {
    assert.equal(r.success, false, `${r.id} normalized by findBySnapshotAndType`);
    assert.equal(r.status, 'error');
  }
}

const mtastsByType = await repo.findBySnapshotAndType('snapshot-1', 'mta_sts');
assert.deepEqual(
  mtastsByType.map((r) => r.id),
  ['mtasts-success', 'mtasts-failed'],
  'non-SMTP type rows untouched and hostname-sorted'
);
assert.equal(mtastsByType[1].status, 'error');

// --- findByHostname: exact hostname selection + normalize ---------------
const byHostname = await repo.findByHostname('snapshot-1', 'mx-forged-chain-false.example.com');
assert.deepEqual(
  byHostname.map((r) => r.id),
  ['forged-chain-false'],
  'findByHostname selects the exact hostname'
);
assert.equal(byHostname[0].success, false, 'findByHostname normalizes forged SMTP');
assert.equal(byHostname[0].status, 'error');

const mtastsByHostname = await repo.findByHostname('snapshot-1', 'mta-sts.example.com');
assert.deepEqual(mtastsByHostname.map((r) => r.id), ['mtasts-success']);
assert.equal(mtastsByHostname[0].success, true);

// --- findFailedProbes: normalize BEFORE filtering -----------------------
const failed = await repo.findFailedProbes('snapshot-1');
assert.deepEqual(
  failed.map((r) => r.id),
  [
    'forged-tlstrusted-no-cert',
    'forged-chain-false',
    'forged-hostname-false',
    'legacy-null-probedata',
    'genuine-timeout',
    'forged-at-threshold',
    'legacy-null-timing',
    'legacy-out-of-range',
    'mtasts-failed',
  ],
  'forged raw-success SMTP rows must surface as failures'
);
assert.ok(
  !failed.some((r) => r.id === 'trusted' || r.id === 'mtasts-success'),
  'trusted rows must be excluded from failures'
);
const failedTimeout = failed.find((r) => r.id === 'genuine-timeout');
assert.equal(failedTimeout.status, 'timeout', 'raw timeout status preserved in failures');
const failedMtasts = failed.find((r) => r.id === 'mtasts-failed');
assert.equal(failedMtasts.status, 'error', 'failed non-SMTP row preserved');
assert.equal(failedMtasts.success, false);

// --- findSlowProbes: threshold equality in, null timing out -------------
const slow = await repo.findSlowProbes('snapshot-1', 500);
assert.deepEqual(
  slow.map((r) => r.id),
  ['forged-at-threshold'],
  'equality at threshold included; null timing excluded'
);
assert.equal(slow[0].success, false, 'slow forged SMTP row normalized');
assert.equal(slow[0].status, 'error');
assert.deepEqual(
  await repo.findSlowProbes('snapshot-1', 501),
  [],
  'rows below threshold excluded'
);

// --- findByTimeRange: inclusive boundaries + normalize ------------------
const inRange = await repo.findByTimeRange(
  new Date('2026-09-01T00:00:00Z'),
  new Date('2026-09-01T23:59:59Z')
);
assert.deepEqual(
  inRange.map((r) => r.id),
  [
    'trusted',
    'forged-tlstrusted-no-cert',
    'forged-chain-false',
    'forged-hostname-false',
    'legacy-null-probedata',
    'genuine-timeout',
    'forged-at-threshold',
    'legacy-null-timing',
    'mtasts-success',
    'mtasts-failed',
  ],
  'inclusive range excludes only the out-of-range row'
);
const inRangeForged = inRange.find((r) => r.id === 'forged-chain-false');
assert.equal(inRangeForged.success, false, 'in-range forged SMTP normalized');
assert.equal(inRangeForged.status, 'error');
assert.equal(inRange.find((r) => r.id === 'trusted').success, true);
// Exact instant: both boundaries inclusive.
const exactInstant = await repo.findByTimeRange(
  new Date('2026-09-01T00:00:00Z'),
  new Date('2026-09-01T00:00:00Z')
);
assert.equal(exactInstant.length, 10, 'both time boundaries are inclusive');

// --- persistence boundary: certificate verdicts beat caller assertions --
const forgedPersist = smtpResultToObservation('snapshot-1', {
  success: true,
  hostname: 'forged.example.com',
  port: 25,
  supportsStarttls: true,
  tlsNegotiated: true,
  tlsTrusted: true, // forged caller bit, contradicted below
  certificate: { ...trustedCert, chainAuthorized: false },
  responseTimeMs: 10,
});
assert.equal(forgedPersist.success, false, 'forged tlsTrusted must not persist as success');
assert.equal(forgedPersist.status, 'error');
assert.equal(forgedPersist.probeData.tlsTrusted, false, 'persisted tlsTrusted must be derived');

// Decisive P1 control: caller bit FALSE with both certificate verdicts true
// must still persist as trusted success — the caller assertion is no longer
// part of the derivation.
const callerFalsePersist = smtpResultToObservation('snapshot-1', {
  success: true,
  hostname: 'valid.example.com',
  port: 25,
  supportsStarttls: true,
  tlsNegotiated: true,
  tlsTrusted: false, // stale/incorrect caller assertion
  certificate: trustedCert,
  responseTimeMs: 10,
});
assert.equal(
  callerFalsePersist.probeData.tlsTrusted,
  true,
  'persisted tlsTrusted must derive from certificate verdicts alone'
);
assert.equal(callerFalsePersist.success, true);
assert.equal(callerFalsePersist.status, 'success');

const trustedPersist = smtpResultToObservation('snapshot-1', {
  success: true,
  hostname: 'trusted.example.com',
  port: 25,
  supportsStarttls: true,
  tlsNegotiated: true,
  tlsTrusted: true,
  certificate: trustedCert,
  responseTimeMs: 10,
});
assert.equal(trustedPersist.success, true, 'trusted result must persist as success');
assert.equal(trustedPersist.status, 'success');

// --- persistence write path via repository (no db handle) ---------------
const persisted = await persistProbeObservations(null, 'snapshot-1', 'tenant-1', []);
assert.equal(persisted, 0, 'no-db path still skips persistence safely');

// --- adapter rows were never mutated by any read ------------------------
assert.deepEqual(
  rows,
  adapterRowsSnapshot,
  'adapter-owned rows must be byte-for-byte unchanged after every read'
);

// Concrete returned IDs (recorded for the evidence document).
console.log('findById(forged-chain-false):', forgedById.id, forgedById.success, forgedById.status);
console.log('findBySnapshotAndType(smtp_starttls):', smtpByType.map((r) => r.id).join(','));
console.log('findByHostname:', byHostname.map((r) => r.id).join(','));
console.log('findFailedProbes:', failed.map((r) => r.id).join(','));
console.log('findSlowProbes(500):', slow.map((r) => r.id).join(','));
console.log('findByTimeRange:', inRange.map((r) => r.id).join(','));
console.log('persist(caller-false/cert-true):', callerFalsePersist.probeData.tlsTrusted, callerFalsePersist.status);

console.log('issue74 fail-closed proof: ALL CHECKS PASSED');
