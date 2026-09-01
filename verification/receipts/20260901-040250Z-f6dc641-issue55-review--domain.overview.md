---
receipt: verification-receipt/v0
run_id: 20260901-040250Z-f6dc641-issue55-review
feature_id: domain.overview
profile: changed
surface: web
sha: f6dc641bdf0f774265d0acd8c8faa880bd8bce3f
code_digest: f93890e22d9924fabd28c86599ff1592aac65f591bba5f78414792684b44d495
dirty: true
untracked: 0
status: blocked
reason: "Fresh exact-tree verification is blocked: local PostgreSQL at 127.0.0.1:5432 is unreachable, so the live Domain 360 harness cannot read a persisted snapshot with public-recursive evidence. Safe checks passed: 18 isolated local Playwright domain-state tests, 31 DNS TTL unit tests, 2775 repository tests, collector tests (1200), verify-kit gitlink regression, typechecks, builds, focused Biome checks, and lint-map --fresh. No provider, production, credential, or push operation was performed."
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260901-040250Z-f6dc641-issue55-review
created_at: 2026-09-01T04:03:59.756Z
---

# Receipt: domain.overview — blocked

## Observations (expected → seen)

- Safe checks passed: 18 isolated local Playwright domain-state tests, 31 DNS TTL unit tests, 2775 repository tests, 1200 collector tests, the verify-kit gitlink regression, package typechecks, package builds, focused Biome checks, and `lint-map --fresh`.

## Forbidden (must not happen → confirmed absent)

- No provider, production, credential, live-replay, tracker, or push operation was performed.

## Read-back (side effects checked through an independent path)

- The current exact tree is bound to this receipt. Local PostgreSQL at 127.0.0.1:5432 is unreachable, so the live Domain 360 harness cannot read a persisted snapshot with public-recursive evidence; live persisted-evidence verification remains blocked.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-040250Z-f6dc641-issue55-review/doctor.txt | txt | aux · unrecognized .txt | 291b74911bf6dfd21a1053e0e8228c479187272578439eb81b5a8d36a6fd7e6c |
| verification/runs/20260901-040250Z-f6dc641-issue55-review/env.txt | env | aux | 2e71f95e85244fa0f1034298df122208b49cd042f0138bef05cff8956873f515 |
| verification/runs/20260901-040250Z-f6dc641-issue55-review/observations.md | md | aux · unrecognized .md | 2e45ecac7dc061cb6a0720b036d043a50991eec81853c504c7d06c10dc63ea09 |
