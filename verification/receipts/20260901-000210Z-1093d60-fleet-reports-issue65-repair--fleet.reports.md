---
receipt: verification-receipt/v0
run_id: 20260901-000210Z-1093d60-fleet-reports-issue65-repair
feature_id: fleet.reports
profile: changed
surface: web
sha: 1093d60baadc6308563b1b2120be506b6ae70059
code_digest: 49e03db5b0b5a3bef500b7398749c897b7e3d9f7bbbe76cb0c618ae70d6e4b2a
dirty: true
untracked: 0
status: passed
reason: ""
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260901-000210Z-1093d60-fleet-reports-issue65-repair
created_at: 2026-09-01T00:14:03.003Z
---

# Receipt: fleet.reports — passed

# Observations — fleet.reports (issue #65 review repair)

Stack: local docker Postgres (127.0.0.1:5433, pgvector:pg16) migrated + seeded
read-only (one verify tenant via deterministic dev-tenant UUID; 6 domains with
snapshots/observations/findings; no providers contacted, probes disabled), web
dev on :3010 and collector dev on :3011 from this worktree; doctor.sh 5/5 ok
(doctor.txt).

## Repairs verified (from review 3f12d201)

1. P1 — null-ruleset snapshot (never-evaluated.example, ruleset_version_id
   NULL, findings present in DB): `POST /api/fleet-report/run` returns 200 with
   a result row (not an error entry), every requested check `unknown`,
   `findingsCount: 0`, no issues. UI renders UNKNOWN badges for it
   (fleet-report-live-repair.png, readback/fleet-report-live-badges.json).
   Before the fix this path returned `Findings not evaluated` per-domain error
   and zero check rows.
2. P2 — unknown-status rows never enter `issues`: covered at route level by
   the mock-DB regression test (unrecognized severity 'urgent' → status
   unknown, `issues: []`, `domainsWithIssues` unaffected,
   `highPriorityIssues: []`). DB severity is an enum, so the live seed cannot
   carry an out-of-enum severity; the code-level test locks the filter
   `severity !== 'ok' && status !== 'unknown'`.
3. P2 — feature proof recipe now uses valid Playwright `getByLabel`
   (feature file line 45); the live UI drive used that exact locator
   successfully (drive-fleet-65.mts).

## API proof (http/fleet-report-run-response.json, web → collector, X-Dev-Tenant/X-Dev-Actor)

| domain               | spf     | issues | findings |
|----------------------|---------|--------|----------|
| stale.example        | unknown | 0      | 0        |
| partial.example      | unknown | 0      | 0        |
| uncorrelated.example | unknown | 0      | 0        |
| clean.example        | pass    | 1 (info-severity, pre-existing) | 1 |
| broken.example       | fail    | 1      | 1        |
| never-evaluated.example | unknown | 0   | 0        |

`domainsWithErrors: 0`, `summary.spfStats = {pass:1, fail:1, warning:0,
missing:0, unknown:4}`, `domainsWithIssues: 2`, unknown-only domains do not
increment `domainsWithIssues`.

Note: `clean.example` shows `issues: 1` because an affirmative info-severity
finding (`severity !== 'ok'`) is counted as an issue. That is pre-existing
behavior outside the reviewed findings (the review only requires unknown-status
rows to stay out of issues) and was left unchanged.

## UI proof (fleet-report-live-repair.png, readback/fleet-report-live-badges.json, trace.zip)

/portfolio → Fleet Reports → Mail Security Baseline → inventory of the 6
seeded domains → Run Report → expand all: stale/partial/uncorrelated/
never-evaluated render `ds-badge--unknown` (`?`, title=unknown) for all four
template checks; clean renders one success badge (pass) plus unknowns; broken
renders one danger badge (fail) plus unknowns. No success badge on any
unknown-status check.

Console noise (console.log, failed-requests.log) is the same pre-existing
Google Fonts CORS (dev-header preflight) plus one 404 dev asset noted in the
prior receipt; unrelated to fleet reports.

## Committed checks

- `bunx vitest run apps/collector/src/jobs/fleet-report.test.ts
  apps/collector/src/jobs/fleet-report.logic.test.ts` — 57 passed (was 2 failed
  before the source fix: the two new regression tests).
- Repo `bunx vitest run` — 2755 passed / 0 failed (54 skipped).
- collector + web `lint` and `typecheck` exit 0.
- Committed e2e `apps/web/e2e/fleet-report.spec.ts` against the live :3010
  stack — 2 passed.
- `verify.mjs lint-selectors` 0 errors; `lint-map --fresh` 0 errors.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-000210Z-1093d60-fleet-reports-issue65-repair/console.log | log | aux · unrecognized .log | de1e2146fa870ea38bb00dd53f22d3b7de146aa5432bbbb54b3e0e045b6011a0 |
| verification/runs/20260901-000210Z-1093d60-fleet-reports-issue65-repair/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-000210Z-1093d60-fleet-reports-issue65-repair/drive-fleet-65.mts | mts | aux · unrecognized .mts | 8e8398197a79946105dc3a046b5797c91956f1273f0ac85e37a11d749942756c |
| verification/runs/20260901-000210Z-1093d60-fleet-reports-issue65-repair/env.txt | env | aux | a028001651a73f0ac27e2c4291567864dfcc45b8844c3d8ca8f6df331c78d5a0 |
| verification/runs/20260901-000210Z-1093d60-fleet-reports-issue65-repair/failed-requests.log | log | aux · unrecognized .log | 759c2309151311a18dfedec7d3cc9f4365c84dbce49cb6504ac93287af4fb52f |
| verification/runs/20260901-000210Z-1093d60-fleet-reports-issue65-repair/fleet-report-live-repair.png | png | evidence · 1280x4538 | 48ff81a4bcbda9d5dba8d73b4ffb08ae0ce116aa327a3e0fbf54186b7edf7502 |
| verification/runs/20260901-000210Z-1093d60-fleet-reports-issue65-repair/http/fleet-report-run.json | http | evidence | c2f832eefc917c4c65cf40b77055ec8e60369d45e15d4bd1958a80f78adbb760 |
| verification/runs/20260901-000210Z-1093d60-fleet-reports-issue65-repair/observations.md | md | aux · unrecognized .md | 907380f3dfab86352d6e1b6de61c82497d9baad0bf578306e4339914a4f272a1 |
| verification/runs/20260901-000210Z-1093d60-fleet-reports-issue65-repair/readback/fleet-report-live-badges.json | readback | evidence | ee7556b414b124c1f396cef66a63bf9d6187402548e2404833e5ef75d22e7125 |
| verification/runs/20260901-000210Z-1093d60-fleet-reports-issue65-repair/trace.zip | trace | evidence · playwright trace | 91d73524d8e6f15024d3125af9e670ea517ec097a9eb4caa8467da47e470ddaf |
