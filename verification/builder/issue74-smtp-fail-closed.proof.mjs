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

// Minimal in-memory IDatabaseAdapter: only selectWhere/insertMany are used.
const makeAdapter = (rows) => ({
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
  async insertMany(_table, data) {
    return structuredClone(data);
  },
});

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
];

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
  error: 4, // 3 forged + 1 legacy-null SMTP rows
  other: 0,
});

const summary = await repo.getSummary('snapshot-1');
assert.equal(summary.total, 7, 'total unchanged');
assert.equal(summary.successful, 2, 'summary counts only effective success');
assert.equal(summary.failed, 5);
assert.deepEqual(summary.byType, { smtp_starttls: 6, mta_sts: 1 });

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

console.log('issue74 fail-closed proof: ALL CHECKS PASSED');
