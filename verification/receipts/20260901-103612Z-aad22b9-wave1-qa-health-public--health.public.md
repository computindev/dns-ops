---
receipt: verification-receipt/v0
run_id: 20260901-103612Z-aad22b9-wave1-qa-health-public
feature_id: health.public
profile: changed
surface: api
sha: aad22b9ce0acb4a5cbbe8b95e06651466a73f8ed
code_digest: ba8b0a0068efbcc82e351a6db480d965fd98f511c5aec310c888b56f74879a6f
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-local-loopback-web-collector-disposable-postgres"
evidence_dir: verification/runs/20260901-103612Z-aad22b9-wave1-qa-health-public
created_at: 2026-09-01T10:39:07.585Z
---

# Receipt: health.public — passed

## Observations (expected → seen)

- A clean isolated worktree at exact product SHA `aad22b9ce0acb4a5cbbe8b95e06651466a73f8ed` recorded `dirty: false` and `untracked: 0` before driving. Web and collector ran on loopback only against a disposable local PostgreSQL database with `ENABLE_ACTIVE_PROBES=false`.
- Unauthenticated web `GET /api/health` returned HTTP 200 JSON with `status: healthy`, `service: dns-ops-web`, and the exact product revision. Collector `/healthz` returned HTTP 200 with `status: ok` and the exact revision; `/readyz` returned HTTP 200 with `status: ready` and a database check of `ok`.

## Forbidden (must not happen → confirmed absent)

- Public responses contained no database connection details, secrets, provider output, or live-DNS activity. `/healthz` was treated as liveness only; `/readyz` was checked separately for dependency readiness.
- Both services were local-only; no production service, provider, OAuth, or real credential was contacted.

## Read-back (side effects checked through an independent path)

- A second unauthenticated web health request independently returned the same healthy status class. The captured collector health and readiness requests independently read back liveness, revision, and database readiness from the running collector.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-103612Z-aad22b9-wave1-qa-health-public/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-103612Z-aad22b9-wave1-qa-health-public/env.txt | env | aux | ce197565ede674bd7ab6127cf3fc2e1224c47ee8c6a70dbe71878f241aa8641b |
| verification/runs/20260901-103612Z-aad22b9-wave1-qa-health-public/http/01-web-health.json | http | evidence | f4c9628df7fdb957e8dcdefec626bc44422e34d0239462be757d7b9854830718 |
| verification/runs/20260901-103612Z-aad22b9-wave1-qa-health-public/http/02-readback-web-health.json | http | evidence | 9fa4ed03bbe007b062b4d173fc1f2f20f97fa10d49c171f09467f684799ad1f5 |
| verification/runs/20260901-103612Z-aad22b9-wave1-qa-health-public/http/03-collector-healthz.json | http | evidence | 862df51007973e976a9a2072592fa12c791fe090e322da8745671b0efd5ae6f3 |
| verification/runs/20260901-103612Z-aad22b9-wave1-qa-health-public/http/04-collector-readyz.json | http | evidence | 88189f7e3a1d19a9f2f77b41928b201325c293031df46468817b7813802639b9 |
| verification/runs/20260901-103612Z-aad22b9-wave1-qa-health-public/readback/web-health.json | readback | evidence | b6b196c223c1195dc83421e3a3eee84aa2fb6493d38d003dd3fdc5506a289596 |
