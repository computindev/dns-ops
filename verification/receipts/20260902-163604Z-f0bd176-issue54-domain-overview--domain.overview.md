---
receipt: verification-receipt/v0
run_id: 20260902-163604Z-f0bd176-issue54-domain-overview
feature_id: domain.overview
profile: changed
surface: web
sha: f0bd176e311a8cd4be775917dc95520be24ae190
code_digest: 23bca64cf972bd08a6f1beb2dbcf51cf30b3d8a9a138d9fc35f49e85d0ed6876
dirty: false
untracked: 0
status: blocked
reason: "Live domain.overview verification blocked: the configured local PostgreSQL/collector dependencies did not provide persisted recursive DNS evidence, so the real browser harness could not reach the DNS Parsed timing/read-back assertions. The issue #54 Mail Simulate assertions were not substituted with fabricated evidence."
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260902-163604Z-f0bd176-issue54-domain-overview
created_at: 2026-09-02T16:36:47.935Z
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
| verification/runs/20260902-163604Z-f0bd176-issue54-domain-overview/console.log | log | aux · unrecognized .log | adba316f69fe9751805ddf5f27389ac7a72d979fe5ea9892065e5109edc63dcb |
| verification/runs/20260902-163604Z-f0bd176-issue54-domain-overview/domain-overview.png | png | evidence · 1280x720 | 10374606b0f7c63e9cbb64695cedd291c6a01748719452621695e9d04720bb78 |
| verification/runs/20260902-163604Z-f0bd176-issue54-domain-overview/env.txt | env | aux | 90704f3d88628e0ec444bfaa618bf74cd1130a4d2e89f533f0d37d74fe16f52f |
| verification/runs/20260902-163604Z-f0bd176-issue54-domain-overview/failed-requests.log | log | aux · unrecognized .log | f167380b0ea520158800fa98eeecfe74d20c7c7eb55cdf7c06295e948e7145a6 |
| verification/runs/20260902-163604Z-f0bd176-issue54-domain-overview/trace.zip | trace | evidence · playwright trace | 3cdb2ea4fb7533f7eae75bce9a47b61d94d6cc4f68b3230127dee07f454abdad |
| verification/runs/20260902-163604Z-f0bd176-issue54-domain-overview/web-server.log | log | aux · unrecognized .log | b22fb443f01542ef6962bf9721470d74b0347ff4c730b080799a17f68cf6d300 |
| verification/runs/20260902-163604Z-f0bd176-issue54-domain-overview/web.pid | pid | aux · unrecognized .pid | c227003728e380f605f089dc24a36c55f12d6927f352aa72c5440f1fa51bc3b7 |
