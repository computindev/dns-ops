---
receipt: verification-receipt/v0
run_id: 20260901-014313Z-0becc8c-issue55-ttl-overflow-ui
feature_id: domain.overview
profile: changed
surface: web
sha: 0becc8c54e2c08739934f31aec5e68f4f11d8168
code_digest: feed67c7ead6693ee3bbaa44ca3edaa0a1258b87eecae27440bb25a9f53e4ce8
dirty: true
untracked: 0
status: blocked
reason: "Local Postgres on port 5432 is unreachable, so the live Domain 360 harness cannot read a persisted snapshot containing public-recursive evidence. Safe checks passed: 15 Playwright domain-state tests including the Number.MAX_SAFE_INTEGER overflow fixture, 21 targeted TTL unit tests, 982 full web unit tests, web lint/typecheck, and the verify-kit gitlink regression. Live re-verification remains required where persisted evidence exists."
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260901-014313Z-0becc8c-issue55-ttl-overflow-ui
created_at: 2026-09-01T01:43:37.016Z
---

# Receipt: domain.overview — blocked

## Observations (expected → seen)

- Playwright `domain-states.spec.ts`: 15 passed, including the Parsed-view overflow fixture using `Number.MAX_SAFE_INTEGER`; it observed exactly two `UNKNOWN` cells and no `<time>` element.
- TTL unit suite: 21 passed; full web unit suite: 982 passed with 24 skipped. Web lint checked 179 files with no fixes.
- verify-kit working-tree regression: passed against a tracked gitlink whose embedded repository has an unborn HEAD; the emitted digest changed with the unstaged product file.

## Forbidden (must not happen → confirmed absent)

- The overflow fixture found no machine-readable `<time>` element for the unusable deadline.
- `.pi/self-learning-memory` contents were not staged or modified by this work.
- No provider, production, live replay, credential, tracker, push, or PR mutation was performed.

## Read-back (side effects checked through an independent path)

- Local Postgres on port 5432 is unreachable, so the live Domain 360 harness cannot read a persisted snapshot containing public-recursive evidence. The receipt is blocked rather than passed; live re-verification remains required where such evidence exists.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-014313Z-0becc8c-issue55-ttl-overflow-ui/cli-e2e-domain-states.txt | transcript | evidence | 0810f3a65d4dec65abbb03d26030a9db02fa207f407fac048b4cba2fbf891397 |
| verification/runs/20260901-014313Z-0becc8c-issue55-ttl-overflow-ui/cli-verify-kit-regression.txt | transcript | evidence | c6cb34ec3ddfae7100a79c097e9a38c5b2def5e8cf03975c6e054febd1d98cbb |
| verification/runs/20260901-014313Z-0becc8c-issue55-ttl-overflow-ui/env.txt | env | aux | 8f80dff61728bbe37345a71d36ff1986335bc80c690b82b2f195bf454557bc05 |
| verification/runs/20260901-014313Z-0becc8c-issue55-ttl-overflow-ui/observations.md | md | aux · unrecognized .md | 8ed8c0fa22aa202c3a6872278f1b30ffa4fd892789cb93d62f41e2e56e715558 |
