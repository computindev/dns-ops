# Builder Evidence — Issue #74 Final Hardening: Trust From Certificate Verdicts Only

- **Base (reviewed SHA)**: `6ee9425184b93587c8ce19699fac48181ff1aeb4`
- **Implementation SHA (this repair)**: `837b5f8b4e528a096ab025ae10a70ac4b7dbcd2f`
- **Code digest (verify-kit, at implementation SHA)**: `1e8a35c9fd06`
- **Tree state at verification**: clean (`git status --porcelain` empty)
- **Branch**: `pi-parallel-453ae2d6-601e-4c98-9006-27aa29dbf906-0` (local only; not pushed, no PR, no deploy)
- **Builder**: implementation worker (NOT an independent fresh verifier)
- **Environment**: Linux 7.0.0-30-generic, Node v22.23.2, Bun 1.3.14, bun
  workspaces (`node_modules` freshly installed in this worktree; git-ignored
  machine-local, isolated linker)

## Scope

Two production changes only, per the approved plan:

1. `apps/collector/src/probes/persist-observations.ts` — the derived
   `tlsTrusted` bit no longer conjuncts the caller-asserted
   `result.tlsTrusted`; it derives exclusively from the certificate's
   `chainAuthorized === true && hostnameAuthorized === true` verdicts.
   `trusted` (and therefore persisted `success`/`status:'success'`) still
   requires raw `result.success`, STARTTLS support, and TLS negotiation.
   Certificate diagnostics, error/timeout mapping unchanged.
2. `packages/db/src/repos/probe-observation.ts` — the existing `asReadRow`
   normalizer (no new predicate, no new status) applied at the six remaining
   read boundaries:
   - `findById`: `result ? asReadRow(result) : null`
   - `findBySnapshotAndType`: filter by type → map → hostname sort (unchanged order of operations semantics)
   - `findByHostname`: filter by hostname → map
   - `findFailedProbes`: **map (normalize) before filtering** `!success`, so
     forged/legacy raw-`success:true` SMTP rows surface as failures
   - `findSlowProbes`: `responseTimeMs !== null && >= threshold` (inclusive) → map
   - `findByTimeRange`: inclusive `probedAt >= start && <= end` → map

Out of scope (unchanged): schema/migrations, historical-row rewrites,
`isEffectivelySuccessful`/`asReadRow` logic, snapshot `eq(...)` predicates,
tenant-parameter API, UI, provider/production activity.

## All ten repository read/aggregate methods (explicit coverage statement)

| # | Method | Trust handling at `837b5f8…` |
| --- | --- | --- |
| 1 | `findBySnapshotId` | normalized (previously covered, unchanged) |
| 2 | `findBySnapshotAndType` | **normalized in this repair** |
| 3 | `findByHostname` | **normalized in this repair** |
| 4 | `findFailedProbes` | **normalized in this repair, before filtering** |
| 5 | `findSlowProbes` | **normalized in this repair** |
| 6 | `findByTimeRange` | **normalized in this repair** |
| 7 | `findById` | **normalized in this repair** |
| 8 | `findSuccessfulSmtpProbes` | effective-success predicate (previously covered, unchanged) |
| 9 | `countByStatus` | effective status via `asReadRow` (previously covered, unchanged) |
| 10 | `getSummary` | effective success (previously covered, unchanged) |

No blanket claim: `create`, `createMany` (writes) are not success reads.

## Commands run (at implementation SHA `837b5f8…`, clean tree, in order)

| Command | Result |
| --- | --- |
| `bun install` | OK (1319 packages, isolated linker) |
| `bun run build` (turbo, incl. `@dns-ops/db`, `@dns-ops/logging`, collector, web) | 8/8 tasks OK |
| `bunx vitest run apps/collector/src/probes/probe-observation.test.ts apps/collector/src/e2e/probe-observation-persistence.e2e.test.ts apps/collector/src/jobs/probe-routes.authorization.test.ts apps/collector/src/jobs/operational-condition-finalizer.test.ts apps/web/hono/lib/mcp-read-service.test.ts` | 5 files, **93 passed** |
| `bunx vitest run` (full workspace suite) | 189 files passed (3 skipped), **3004 passed / 54 skipped / 0 failed** |
| `node verification/builder/issue74-smtp-fail-closed.proof.mjs` | **ALL CHECKS PASSED** (built dist artifacts, 11-row fixture set) |
| `bun run typecheck` (turbo) | 14/14 OK |
| `bun run lint` (turbo, incl. biome auto-fix of one format nit in the new test, re-verified) | 8/8 OK |
| `ubs --diff .` | 0 critical, 0 warning (305 info, 5 files) |
| `git diff --check 6ee9425…837b5f8…` | clean (no whitespace errors) |
| `git status --porcelain` | empty |
| `node .agents/verify-kit/verify.mjs start --auto --base 6ee9425…` | "no mapped feature affected … nothing pending" |
| `node .agents/verify-kit/verify.mjs check-commit --working-tree` | OK (affected features: 0) |

## Executable security-surface proof (positive + negative controls)

`verification/builder/issue74-smtp-fail-closed.proof.mjs` drives the **built**
`packages/db/dist` and `apps/collector/dist` through an in-memory adapter
(no vitest, no mocks of the units under test), now with `selectOne`/`select`
adapter support and an 11-row fixture set (trusted SMTP; forged
`tlsTrusted:true` without certificate; forged chain-false; forged
hostname-false; legacy `probeData:null`; genuine timeout; forged row at the
slow threshold; legacy null-timing; legacy out-of-range; MTA-STS success and
failure).

Concrete returned observations (from the proof's own output):

```
findById(forged-chain-false): forged-chain-false false error
findBySnapshotAndType(smtp_starttls): forged-at-threshold,forged-chain-false,forged-hostname-false,forged-tlstrusted-no-cert,genuine-timeout,legacy-null-probedata,legacy-null-timing,legacy-out-of-range,trusted
findByHostname: forged-chain-false
findFailedProbes: forged-tlstrusted-no-cert,forged-chain-false,forged-hostname-false,legacy-null-probedata,genuine-timeout,forged-at-threshold,legacy-null-timing,legacy-out-of-range,mtasts-failed
findSlowProbes(500): forged-at-threshold
findByTimeRange: trusted,forged-tlstrusted-no-cert,forged-chain-false,forged-hostname-false,legacy-null-probedata,genuine-timeout,forged-at-threshold,legacy-null-timing,mtasts-success,mtasts-failed
persist(caller-false/cert-true): true success
```

- **Persistence P1 fix (decisive positive control)**: caller
  `tlsTrusted:false` + `chainAuthorized:true` + `hostnameAuthorized:true` +
  raw success + STARTTLS + TLS negotiated → persists
  `probeData.tlsTrusted:true`, `success:true`, `status:'success'`. Before
  this repair the stale caller bit forced `tlsTrusted:false`.
- **Persistence negative controls (retained)**: caller
  `success:true`/`tlsTrusted:true` with `chainAuthorized:false` persists
  `success:false` / `status:'error'` / `probeData.tlsTrusted:false`;
  certificate evidence retained; fully trusted result persists success;
  `persistProbeObservations(null, …)` no-ops safely.
- **Read boundaries (all six)**: forged/legacy SMTP rows read
  `success:false` / `status:'error'` through `findById`,
  `findBySnapshotAndType`, `findByHostname`, `findFailedProbes` (where they
  now appear as failures), `findSlowProbes`, `findByTimeRange`; trusted SMTP
  and both MTA-STS rows returned unchanged; type filter, hostname sorts,
  exact-hostname selection, `>= threshold` equality at 500, null-timing
  exclusion, inclusive start/end boundaries (including exact-instant range)
  and out-of-range exclusion all asserted by exact ID lists.
- **Raw failure statuses**: genuine timeout keeps `status:'timeout'` in every
  method that returns it; failed non-SMTP row keeps `status:'error'`.
- **Adapter integrity**: `structuredClone` snapshot compared after all reads
  — adapter-owned rows byte-for-byte unchanged; the adapter also asserts
  `selectWhere` still filters on `snapshotId`.

## Test matrix

- `apps/collector/src/probes/probe-observation.test.ts` — existing 14-row
  issue-74 fixture harness extended with `selectOne`/`select` wiring; a
  table-driven test covers all six methods (14 cases) asserting expected ID
  lists (selection + ordering + boundaries), forged rows fail closed with
  diagnostics deep-equal, trusted/non-SMTP rows returned byte-for-byte, raw
  timeout/refused statuses preserved, and adapter fixtures deep-equal
  before/after each call.
- `apps/collector/src/e2e/probe-observation-persistence.e2e.test.ts` — added
  the decisive positive control (caller `tlsTrusted:false`, certificate
  verdicts true/true → persisted `tlsTrusted:true`, `success:true`,
  `status:'success'`); retained the bad-chain, bad-hostname, and
  missing-certificate negative controls.

## Honest coverage disclosure (verify-kit)

- SMTP probe paths are **not mapped** to any verify-kit feature (the feature
  map contains only auth.*, domain.overview, fleet.reports, health.public,
  portfolio.search). `verify.mjs start --auto --base 6ee9425…` reported
  "no mapped feature affected … nothing pending"; the commit gate passed
  with **affected features: 0**.
- No receipt was written: a dedicated critical feature mapping (proposed
  `smtp.starttls-trust`) requires owner approval; mislabeling as
  `domain.overview` or writing a `not_applicable` receipt is refused.
- Prior evidence (`3b9d202…` builder evidence) and the dirty `8bef5ff…`
  receipt were NOT reused; this document is new for `837b5f8…`.
- A builder proof is not an independent verdict. Fresh verification for this
  critical boundary must: use an isolated clean worktree at exactly
  `837b5f8b4e528a096ab025ae10a70ac4b7dbcd2f`, avoid reading builder evidence
  before forming the verdict, run
  `node verification/builder/issue74-smtp-fail-closed.proof.mjs` through
  `harness/cli.sh` with a valid CLI transcript, produce expected/forbidden/
  read-back observations for all six methods and both persistence controls,
  and record `verifier=fresh`, `profile=critical`, matching SHA
  `837b5f8…` and code digest `1e8a35c9fd06`, `dirty:false`. Policy accepts
  only `passed` for critical work.

## Residual risks / limitations

- The proof runs at the database adapter boundary with an in-memory adapter —
  it does not exercise live SMTP handshakes or Postgres; TLS verification
  itself is upstream of this change.
- Read-time normalization changes only the read representation; historical
  rows are not rewritten.
- `findById` and `findByTimeRange` keep their existing caller-owned
  authorization scope; this repair does not add tenant isolation.
- Repo-level authorization/finalizer/MCP regressions were run green
  (`probe-routes.authorization.test.ts`,
  `operational-condition-finalizer.test.ts`, `mcp-read-service.test.ts`).

## Changed files

- `packages/db/src/repos/probe-observation.ts`
- `apps/collector/src/probes/persist-observations.ts`
- `apps/collector/src/probes/probe-observation.test.ts`
- `apps/collector/src/e2e/probe-observation-persistence.e2e.test.ts`
- `verification/builder/issue74-smtp-fail-closed.proof.mjs`
