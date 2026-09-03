---
receipt: verification-receipt/v0
run_id: 20260903-204539Z-488058f-issue58-domain-overview-e2e
feature_id: domain.overview
profile: changed
surface: web
sha: 488058f9ac441e6e0fd0ea417ff549992259594d
code_digest: 852936205f106b2e1441b679e7cbb51644d8b41ec2006e5efbb8d1b99b2d656d
dirty: true
untracked: 0
status: blocked
reason: "UI/route behavior proven on the real dev server via canonical Playwright specs (domain-signal-room 4/4, domain-states 18/18, finding-simulation 4/4) and 1033 unit tests, but the persisted-evidence DNS TTL audit and findings-summary read-back against freshly collected public-recursive evidence were not re-driven: the only reachable local DB holds fixture snapshots, and the session ended before a live collection drive per orchestrator guidance."
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260903-204539Z-488058f-issue58-domain-overview-e2e
created_at: 2026-09-03T20:46:04.003Z
---

# Receipt: domain.overview — blocked

## Observations (expected → seen)

- 

## Forbidden (must not happen → confirmed absent)

- 

## Read-back (side effects checked through an independent path)

- 

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-204539Z-488058f-issue58-domain-overview-e2e/env.txt | env | aux | 043949f6ced4aae38bf529e0004249f06a2be97047e5280f044921f52bfca1fe |
| verification/runs/20260903-204539Z-488058f-issue58-domain-overview-e2e/observations.md | md | aux · unrecognized .md | 3d1ad11f8fab820f84f7575d62e1225c6045eb9d422bd4e716105f00501e9dd6 |
