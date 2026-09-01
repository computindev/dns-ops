---
receipt: verification-receipt/v0
run_id: 20260901-080150Z-ed2bdbd-final-fresh-health-public
feature_id: health.public
profile: changed
surface: api
sha: ed2bdbda1c82e58e4ee26733d9a27c838676d166
code_digest: 276e22d7929f5fd89dd6a4a43340dae4fd7638015604924149027c031850fed2
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-independent-final66-local-loopback"
evidence_dir: verification/runs/20260901-080150Z-ed2bdbd-final-fresh-health-public
created_at: 2026-09-01T08:15:22.288Z
---

# Receipt: health.public — passed

## Observations (expected → seen)

- Clean exact product tree `ed2bdbda1c82e58e4ee26733d9a27c838676d166` with no tracked changes or untracked files → `run-new` recorded `dirty: false`, `untracked: 0`; only ignored build outputs were used.
- Unauthenticated web `GET /api/health` → HTTP 200 with `status: "healthy"`, `service: "dns-ops-web"`, and revision equal to the exact product SHA.
- Unauthenticated collector `GET /healthz` → HTTP 200 with `status: "ok"` and the exact product revision.
- Unauthenticated collector `GET /readyz` → HTTP 200 with `status: "ready"` and database check `ok`.
- Second unauthenticated web health request → same HTTP 200 healthy class and exact revision.

## Forbidden (must not happen → confirmed absent)

- Health bodies must not expose credentials, connection strings, driver errors, or database details → captured responses contain only public status, service, timestamp, revision, and readiness status.
- Liveness must not be treated as readiness → `/healthz` and `/readyz` were requested and recorded separately.
- Provider or production access must not occur → only loopback web/collector and disposable local PostgreSQL were used; active probes and workers were disabled.

## Read-back (side effects checked through an independent path)

- Independent second `GET /api/health` and collector `/readyz` exchanges → same web status/revision and database readiness were read back from separate requests.
- All four captured live responses → revision exactly matched the product SHA.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-080150Z-ed2bdbd-final-fresh-health-public/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-080150Z-ed2bdbd-final-fresh-health-public/env.txt | env | aux | 8774f30f5c879b5e6ade8663ded3a2535368034aa504ac1cdeb873caeb254318 |
| verification/runs/20260901-080150Z-ed2bdbd-final-fresh-health-public/health-drive.log | log | aux · unrecognized .log | 298dc416ef0ea501dfe823b97e518bb8beb0c64afc1271853a788202e215e72d |
| verification/runs/20260901-080150Z-ed2bdbd-final-fresh-health-public/http/01-web-health.json | http | evidence | a49d18f7f41bc21104769591a2275187b5cc0b93eab51c487509d34b22db5740 |
| verification/runs/20260901-080150Z-ed2bdbd-final-fresh-health-public/http/02-readback-web-health.json | http | evidence | 12d2d7e2fe30f5e01cf0030ecd18e7a49c698f6ea8b4a028ab2c21e5623fb003 |
| verification/runs/20260901-080150Z-ed2bdbd-final-fresh-health-public/http/03-collector-healthz.json | http | evidence | cdf91d77bf48ed8c1d9c4780945580f6ba988914874a308e09e6fca9f8a9cce8 |
| verification/runs/20260901-080150Z-ed2bdbd-final-fresh-health-public/http/04-collector-readyz.json | http | evidence | c4fbdd9667ef27d9c2e3b1bdf237b1065121bc0e59ef9e5301340658c792edeb |
| verification/runs/20260901-080150Z-ed2bdbd-final-fresh-health-public/observations.md | md | aux · unrecognized .md | 4a6c6b010d72d9c3e414bd016f064c54e3afb98088cbccef8ce8a3d3ce0dc680 |
| verification/runs/20260901-080150Z-ed2bdbd-final-fresh-health-public/readback/web-health.json | readback | evidence | bd8584a797c06f74babd6f1e1f0f4a50ea3103d531cfd85a5538a35eb62a4fbb |
