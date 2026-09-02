---
receipt: verification-receipt/v0
run_id: 20260902-180535Z-a2d31d8-issue54-domain-overview-final
feature_id: domain.overview
profile: changed
surface: web
sha: a2d31d8d1690a0d9f1861a85bd76877ce8cf1729
code_digest: 81e5e049c1249808e3cbba28abacf1c7f8dd61dbb23bc3d2b28226222e7814f7
dirty: false
untracked: 0
status: blocked
reason: "Live domain.overview verification blocked: the configured local PostgreSQL/collector dependencies did not provide persisted recursive DNS evidence, so the real browser harness could not reach the DNS Parsed timing/read-back assertions. The issue #54 Mail Simulate assertions were not substituted with fabricated evidence."
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260902-180535Z-a2d31d8-issue54-domain-overview-final
created_at: 2026-09-02T18:06:43.334Z
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
| verification/runs/20260902-180535Z-a2d31d8-issue54-domain-overview-final/console.log | log | aux · unrecognized .log | 24a12db347773afbf57cf32566b54e2b43fd17ea5749027ffc0666720f8175c0 |
| verification/runs/20260902-180535Z-a2d31d8-issue54-domain-overview-final/domain-overview.png | png | evidence · 1280x987 | 7ab07559ca5677b4b0b474f3e4bbc1ff3bba71108357fd4b997631e636c2a0ec |
| verification/runs/20260902-180535Z-a2d31d8-issue54-domain-overview-final/env.txt | env | aux | 427dece3a9178e3a20153f4bed5f90b6abca84045fa9e8b50e98819114c6cd95 |
| verification/runs/20260902-180535Z-a2d31d8-issue54-domain-overview-final/failed-requests.log | log | aux · unrecognized .log | 45c0547b99f86b2c6837811400fea1111d72481e09ab3046252c4e3f4d3eeadf |
| verification/runs/20260902-180535Z-a2d31d8-issue54-domain-overview-final/trace.zip | trace | evidence · playwright trace | 3d52e9c3d6da6cd5c275fe061ab901926a63a8cdcbd1fa7193ffcae04e5e4590 |
| verification/runs/20260902-180535Z-a2d31d8-issue54-domain-overview-final/web-server.log | log | aux · unrecognized .log | 110cdfa17975a91f103057ccf86a66ce8aebe6b6d72d6161af0346650e2bb1c2 |
| verification/runs/20260902-180535Z-a2d31d8-issue54-domain-overview-final/web.pid | pid | aux · unrecognized .pid | cba1ef5d5f4a5c6172356e10dd0a07be54e71115686745eafaaf3201388b29dd |
