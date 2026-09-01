---
receipt: verification-receipt/v0
run_id: 20260901-020830Z-83ab0be-fleet-reports-issue65-builder
feature_id: fleet.reports
profile: critical
surface: web
sha: 83ab0be8425ff5133b3ac0fe50f95548c54c0181
code_digest: 134a427d611b1c1335efb9bdca55dd6f672d9dcc2df4ac59bc1c7b016735b293
dirty: true
untracked: 0
status: passed
reason: ""
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260901-020830Z-83ab0be-fleet-reports-issue65-builder
created_at: 2026-09-01T02:16:02.737Z
---

# Receipt: fleet.reports — passed

# Fleet reports issue #65 builder verification

- Exact working tree was exercised locally before commit; no provider, production, LIVE, or tracker-write action was used.
- `bun run test` passed: 179 test files passed, 3 skipped; 2,759 tests passed, 54 skipped. Controlled harness passed 45 tests; migrations test was environment-skipped.
- `bun run build` passed for all 8 workspaces.
- Collector, web, and rules typecheck/lint passed.
- `node .agents/verify-kit/verify.mjs lint-selectors` passed with 0 errors/warnings.
- `node .agents/verify-kit/verify.mjs lint-map --fresh` passed with 0 errors; existing route-registry warnings remain.
- Local web `/api/health` returned `{"status":"healthy","service":"dns-ops-web"}` against the disposable `dns_ops_e60` Postgres container.
- `apps/web/e2e/fleet-report.spec.ts` passed 2/2 using the existing collector boundary fixture and local X-Dev tenant headers. The unknown aggregate card was visible while details were collapsed; the domain-level `Unknown checks` badge appeared after details disclosure; unknown check badge remained distinct from success.
- Focused collector/rules tests passed: 93 tests. Web fleet component/route tests passed: 6 tests. Mail/DNS rule/integration tests passed: 59 tests.
- `ubs --diff .` and `ubs --staged` reported 0 critical issues; they retain existing heuristic warnings (notably missing fetch AbortSignals, sparse test array, and JSX list-key false positives).
- `verification/pending.json` was reset to `fleet.reports(critical)` via `verify.mjs start`; an independent fresh verifier receipt is still required for the exact final commit.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-020830Z-83ab0be-fleet-reports-issue65-builder/env.txt | env | aux | fdb8cc462c91b439e5273c2143d123030bd97295b120576105208e1a576ee3fa |
| verification/runs/20260901-020830Z-83ab0be-fleet-reports-issue65-builder/observations.md | md | aux · unrecognized .md | 245d325d2e7c784b7638e9d4e2e58799693f124f28be49425314648acc3ad384 |
| verification/runs/20260901-020830Z-83ab0be-fleet-reports-issue65-builder/trace.zip | trace | evidence · playwright trace | bb292893a18c7af71f9cc07fae8863b7718712b4e12365f30d5de666df347fc8 |
