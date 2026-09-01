---
receipt: verification-receipt/v0
run_id: 20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime
feature_id: auth.api-principal
profile: critical
surface: api
sha: ed2bdbda1c82e58e4ee26733d9a27c838676d166
code_digest: 276e22d7929f5fd89dd6a4a43340dae4fd7638015604924149027c031850fed2
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-independent-final66-local-api-principal"
evidence_dir: verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime
created_at: 2026-09-01T08:15:22.473Z
---

# Receipt: auth.api-principal — passed

## Observations (expected → seen)

- A configured bare opaque API token → web protected `GET /api/snapshot/20000000-0000-4000-8000-000000000001/findings` returned HTTP 200; collector protected `GET /api/monitoring/reports/shared` returned HTTP 200.
- The same valid token plus forged `X-Tenant-Id: forged-tenant` and `X-Actor-Id: forged-actor` → web returned the same tenant-scoped `stale.example` snapshot response (HTTP 200), and collector returned HTTP 200; request identity headers did not replace the stored principal context.
- Unknown token → web HTTP 401; collector HTTP 401.
- Configured-but-disabled token → web HTTP 401; collector HTTP 401.
- Forged legacy `tenantId:actorId:secret` credential while `ENABLE_LEGACY_API_KEY_AUTH=false` → web HTTP 401; collector HTTP 401.
- Runtime `run-new` snapshot → exact product SHA `ed2bdbda1c82e58e4ee26733d9a27c838676d166`, `dirty: false`, `untracked: 0`.

## Forbidden (must not happen → confirmed absent)

- Forged identity headers must not override a matched principal → the valid-token web response remained the mapped tenant's existing snapshot, not a forged tenant lookup.
- Unknown, disabled, or legacy-forgery credentials must not proceed → every negative web/collector request was HTTP 401.
- Raw API credentials must not appear in evidence → all request credential values are redacted; response bodies and headers contain no token values.
- Provider writes, production systems, or real credentials must not be used → only loopback web/collector and disposable local PostgreSQL were exercised.

## Read-back (side effects checked through an independent path)

- The web response read back the mapped tenant's existing snapshot and persisted findings under the same ruleset; the forged identity headers had no effect.
- The collector response read back tenant-scoped shared-report data without disclosing domain names or internal notes.
- Source/unit coverage additionally exercises malformed principal configuration fail-closed and exact legacy-field parsing in `packages/contracts/src/api-principal.test.ts`, `apps/web/hono/middleware/auth.test.ts`, and `apps/collector/src/middleware/auth.test.ts`.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime/api-principal-drive.log | log | aux · unrecognized .log | d5661dc6319e2345675eafdf6220aa022080d27b6ec3ca0ff7da92d7f80dd22b |
| verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime/api-principal-summary.txt | txt | aux · unrecognized .txt | 2bb15b5d7ab5e827e9fc00bf6250736a2c44994259ab7c4aa0bb21eefd54e0c8 |
| verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime/env.txt | env | aux | 69721c852f4e0ce3ae94abb24f42db9dc232959b2a5ba3e2b389869018c6fae9 |
| verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime/http/01-web-valid-bare-token.json | http | evidence | cf52ad3d0613deadce605ed9e15d7c964eb8d5ee163aa73f91c8b8d2a3b3c3e1 |
| verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime/http/02-web-valid-token-forged-identity-headers.json | http | evidence | 475d613a3dd199b8bc6af017982679eae27c5148d7d690d5b9e134e9b2e127f6 |
| verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime/http/03-collector-valid-token-forged-identity-headers.json | http | evidence | 2a0a14b556823d749f5f5829960d049b9b92902592ec833561c655c3c577c0c7 |
| verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime/http/04-web-unknown-token.json | http | evidence | 917880660d4cfcb850e3d887403777ac930bdeb4ed6c9f4971d9650f357b594b |
| verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime/http/05-collector-unknown-token.json | http | evidence | 53813960486a6df3239df9dff22bd1f353a42a4ee53cd0fb99f53883c59a7c35 |
| verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime/http/06-web-disabled-token.json | http | evidence | 917880660d4cfcb850e3d887403777ac930bdeb4ed6c9f4971d9650f357b594b |
| verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime/http/07-collector-disabled-token.json | http | evidence | d008ac2f4c83d9bc493b5680150c2d7e1e55846bfe2ebb4bce496bf84607c6b8 |
| verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime/http/08-web-forged-legacy-token.json | http | evidence | 917880660d4cfcb850e3d887403777ac930bdeb4ed6c9f4971d9650f357b594b |
| verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime/http/09-collector-forged-legacy-token.json | http | evidence | d6626210297a1035d9f5828a852bdc8b247bfe073fb6ae067813c45b8112a6d8 |
| verification/runs/20260901-080942Z-ed2bdbd-final-fresh-api-principal-runtime/observations.md | md | aux · unrecognized .md | 59f4fcbef250e200b3bb937ba973180f8d9a9f17b993f428207e3bb94b7cc3dd |
