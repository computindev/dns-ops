# Builder Evidence — Issue #74 Follow-up: SMTP Fail-Closed Reads

- **Base (immutable implementation commit)**: `5693ee1290d9a7972012fc99aec99db5024965ed`
- **Implementation SHA (this repair)**: `3b9d2028293c2812d2ee10c148ad1d88043a4813`
- **Code digest (verify-kit, at implementation SHA)**: `043afab358fc`
- **Branch**: `fix/issue74-smtp-fail-closed` (local only; not pushed, no PR, no deploy)
- **Builder**: implementation worker (NOT an independent fresh verifier)
- **Environment**: Linux 7.0.0-30-generic, Node v22.23.2, Bun 1.3.14, bun workspaces
  (`node_modules` is a worktree-shared symlink; excluded machine-locally via
  `.git/info/exclude`, uncommitted)

## Scope

Fail closed on SMTP trust at every success/status query path, per the accepted
plan:

1. `packages/db/src/repos/probe-observation.ts` — private
   `isEffectivelySuccessful` predicate + `asReadRow` normalizer applied to
   `findBySnapshotId`, `findSuccessfulSmtpProbes`, `countByStatus`,
   `getSummary`. Untrusted SMTP rows read as `success:false` /
   `status:'error'` (raw `success` status only); diagnostics, IDs, timing,
   hostname and the adapter-returned objects themselves are untouched.
   Non-SMTP rows unchanged. All `eq(probeObservations.snapshotId, …)`
   predicates unchanged.
2. `apps/collector/src/probes/persist-observations.ts` — persisted
   `tlsTrusted` is derived from the certificate's `chainAuthorized` and
   `hostnameAuthorized` verdicts (conjoined with the caller bit) instead of
   trusting `result.tlsTrusted` alone, so new rows cannot be persisted
   self-contradictory.

Out of scope (unchanged): schema/migrations, new status enum, tenant params,
`findById`/`findBySnapshotAndType`/`findFailedProbes`/`findSlowProbes`/
`findByTimeRange`, non-SMTP behavior, UI.

## Commands run (all at implementation SHA `3b9d202…`, clean tree)

| Command | Result |
| --- | --- |
| `bun install` | OK (675 installs, no changes) |
| `bun run build` (turbo, incl. `@dns-ops/db`, `@dns-ops/logging`, collector, web) | 8/8 tasks OK |
| `bunx vitest run apps/collector/src/probes/probe-observation.test.ts apps/collector/src/e2e/probe-observation-persistence.e2e.test.ts apps/collector/src/jobs/probe-routes.authorization.test.ts apps/collector/src/jobs/operational-condition-finalizer.test.ts apps/web/hono/lib/mcp-read-service.test.ts` | 5 files, **91 passed** |
| `bunx vitest run` (full workspace suite) | 189 files passed (3 skipped), **3002 passed / 54 skipped / 0 failed** |
| `node verification/builder/issue74-smtp-fail-closed.proof.mjs` | **ALL CHECKS PASSED** (executable security-surface proof against built dist artifacts) |
| `bun run typecheck` (turbo) | 14/14 OK |
| `bun run lint` (turbo) | 8/8 OK |
| `ubs --diff .` / `ubs --staged` | 0 critical, 0 warning |
| `git diff --check 5693ee1…3b9d202…` | clean |
| `git status --porcelain` | empty |

## Executable security-surface proof (positive + negative controls)

`verification/builder/issue74-smtp-fail-closed.proof.mjs` drives the **built**
`packages/db/dist` and `apps/collector/dist` through an in-memory adapter
(no vitest, no mocks of the units under test):

- **Negative (repository reads)**: rows with forged `tlsTrusted:true` +
  missing certificate, `chainAuthorized:false`, `hostnameAuthorized:false`,
  and a legacy `probeData:null` row — all read back `success:false` /
  `status:'error'` from `findBySnapshotId`; only the fully-trusted row is
  returned by `findSuccessfulSmtpProbes`; `countByStatus` buckets the forged
  rows as `error` (success = 2: trusted SMTP + MTA-STS; timeout bucket
  preserved for the genuine timeout); `getSummary` counts them `failed`
  (successful 2 / failed 5, total 7 unchanged).
- **Positive**: trusted SMTP row and non-SMTP row read back unchanged
  (`success:true` / `status:'success'`); genuine SMTP timeout keeps raw
  `status:'timeout'`; certificate diagnostics preserved deep-equal.
- **Persistence**: `smtpResultToObservation` with caller-asserted
  `success:true` + `tlsTrusted:true` but `chainAuthorized:false` persists
  `success:false`, `status:'error'`, `probeData.tlsTrusted:false`; the fully
  trusted result persists `success:true` / `status:'success'`;
  `persistProbeObservations(null, …)` still no-ops safely.
- **Scope**: the adapter asserts the repository still filters on
  `snapshotId` (snapshot predicate intact).

## Test matrix (repository side, `probe-observation.test.ts`)

14-row fixture set (trusted, legacy-null, legacy-no-trust, forged-no-cert,
chain-false, chain-missing, hostname-false, hostname-missing,
tls-not-negotiated, no-starttls, genuine timeout, genuine refused,
mta-sts success, mta-sts failed) asserted across all four affected methods,
plus: sort order, `total`/`byType`/`avgResponseTimeMs` unchanged,
diagnostics deep-equal, fixture objects not mutated (`structuredClone`
comparison), `selectWhere` called once with the `probeObservations` table.

Persistence side (`probe-observation-persistence.e2e.test.ts`): forged
`tlsTrusted:true` variants (chain false, hostname false, certificate absent)
all persist as `success:false` with `probeData.tlsTrusted:false` and
certificate evidence retained.

## Honest coverage disclosure (verify-kit)

- SMTP probe paths are **not mapped** to any verify-kit feature. The
  verify-kit hook flagged all four changed source/test files as unmapped
  (`policy.unmapped = warn`); the commit gate passed with **affected
  features: 0**.
- `verify.mjs start --auto` armed `domain.overview` only because base commit
  `5693ee1` (not this repair) touched `packages/db/src/schema/index.ts`, a
  mapped path. This repair's diff touches no mapped path.
- The prior receipt
  `verification/receipts/20260901-205050Z-8bef5ff-issue74-smtp-trust--domain.overview.md`
  (dirty tree, `not_applicable`, different SHA) was **not reused**.
- No receipt was written: per the accepted plan, a real SMTP
  worker/pipeline feature mapping requires owner approval first; mislabeling
  as `domain.overview` or claiming `not_applicable` is refused. The verify-kit
  task is left **paused** with that reason recorded.
- A builder proof is not an independent verdict; any required fresh-verifier
  run must execute separately at `3b9d202…`.

## Residual risks

- `findById`, `findBySnapshotAndType`, `findFailedProbes`, `findSlowProbes`,
  `findByTimeRange` still return raw rows (no production success
  interpretation found through them at this commit); future callers must use
  the effective-success predicate.
- Mapping raw forged `status:'success'` to existing `error` (no new
  `untrusted` enum) is the smallest compatible choice.
- Mock-adapter tests do not prove tenant ownership; tenant authorization
  remains caller-owned (authorization/finalizer/MCP regressions run green).
- `node_modules` is a worktree-shared symlink; ignored machine-locally.

## Changed files

- `packages/db/src/repos/probe-observation.ts`
- `apps/collector/src/probes/persist-observations.ts`
- `apps/collector/src/probes/probe-observation.test.ts`
- `apps/collector/src/e2e/probe-observation-persistence.e2e.test.ts`
- `verification/builder/issue74-smtp-fail-closed.proof.mjs` (new, committed in
  `3b9d202…`; this evidence document committed separately)
