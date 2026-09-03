---
receipt: verification-receipt/v0
run_id: 20260903-181715Z-d1cf098-collector-request-body-limits-fresh
feature_id: collector.request-body-limits
profile: critical
surface: api
sha: d1cf0987a82c03553a82b17699cb71b5397b7b3e
code_digest: eaa042f0feea806029e078abd252189cb01f2f839db5d476f6760cbf8a7a4e7e
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "collector.mts:independent-fresh"
evidence_dir: verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh
created_at: 2026-09-03T18:18:51.456Z
---

# Receipt: collector.request-body-limits — passed

## Observations (expected → seen)

- Exercised 12 production collector POST boundaries for overflow: /api/fleet-report/run, /api/fleet-report/import-csv, /api/probe/mta-sts, /api/probe/smtp-starttls, /api/probe/allowlist/generate, /api/collect/domain, /api/collect/mail, /api/collect/mail/check, /api/monitoring/check, /api/monitoring/alerts/alert-1/resolve, /api/monitoring/domains/domain-1/monitor, /api/notify/webhook.
- 12 declared overflows returned exact 413 {"error":"Request body too large","maxBytes":1048576}.
- 12 chunked overflows returned exact 413; every stream was cancelled and no sentinel was pulled.
- 12 UTF-8 byte-overflows had JavaScript length below 1048576 but encoded bytes above it and returned exact 413.
- 5 bodies were exactly 1048576 bytes and none returned 413; CSV import returned 200 and the four JSON validation routes kept 400 validation.
- 5 malformed-under-limit bodies returned 400, preserving route validation.

## Forbidden (must not happen → confirmed absent)

- The enforced outbound guard recorded zero external attempts (providerAttempts count=0; details=[]).
- No route-specific size error, alternate max value, successful overflow, or post-overflow sentinel read was observed.
- Declared overflow pull counts were at most one runtime-prefetched chunk; chunked overflow pull counts were at most two.

## Read-back (side effects checked through an independent path)

- Re-read every HTTP exchange from disk and wrote the route/case matrix to `readback/request-body-limit.json`.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/collector-launch.log | log | aux · unrecognized .log | 7546fdd0e85a3d7db3005dc9082c9c89b23fe81771385122f12d0ee50c357562 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/collector-process.txt | txt | aux · unrecognized .txt | 2fb5e1eb0f01c6ca58b497a56506c462af9abcc32159f245aa537e56f8cbccc4 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/doctor.txt | txt | aux · unrecognized .txt | ca7da726a0b9549e6b34053e6405f69a028ed5e506c0a129b3873358888fe025 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/env.txt | env | aux | ee35244d383a6b4b637b15b24127f475d02863c09774616046f622abea78b1a1 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/harness.log | log | aux · unrecognized .log | 4f73cd662a4ddb479b4cba40c1531e676a743875fabed5f7321b2d49a16371db |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/01-declared-overflow-api-fleet-report-run.json | http | evidence | d5f498ea5c45a8b061999834328bc6c19f4af0af4184eab6e07022642f32e13e |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/02-declared-overflow-api-fleet-report-import-csv.json | http | evidence | da8191dbe287b780f80a37e74e490e6711919ae36f40020d9f554d75f12e4419 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/03-declared-overflow-api-probe-mta-sts.json | http | evidence | 866a9552de137c2630355da603db45b6561e5f143341eceaaa0ef84e4fc1c1b6 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/04-declared-overflow-api-probe-smtp-starttls.json | http | evidence | aed7d3ad098553a1697b8ea06ec7a11d6a63045b14a05f0350a29db20a3dc495 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/05-declared-overflow-api-probe-allowlist-generate.json | http | evidence | 169f42a89fd7af116d319c58315f63a85a5dcb301c4eb832b731ce61856e7f1f |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/06-declared-overflow-api-collect-domain.json | http | evidence | e5ad4a8b3941407e57aa7f949e9b1a2796a71dcacfd976b008faa2d55a1e9a28 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/07-declared-overflow-api-collect-mail.json | http | evidence | 57e0f7899cd8b9df954d5b249118e0a43064bdea2db186ce8b94d61227f82bf7 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/08-declared-overflow-api-collect-mail-check.json | http | evidence | 043c084cf92f63924fc0f5a5d1d029eaa333d3909a9eb9c756fdb0892815a066 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/09-declared-overflow-api-monitoring-check.json | http | evidence | 3b30ee51eceb6b0fd494d96481798eeb13cbbe877890fcd1671d50fd2a8edc72 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/10-declared-overflow-api-monitoring-alerts-alert-1-resolve.json | http | evidence | 347f99eaebc9946dd01897b56d347757c3eb9028b0629e714cbffcc93712e698 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/11-declared-overflow-api-monitoring-domains-domain-1-monitor.json | http | evidence | 685e281054054a305454e76f68077b66d4c516881b6a78d4b94ad18b0b3145a2 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/12-declared-overflow-api-notify-webhook.json | http | evidence | 9bc6c715fee8c0999d616b55918dae777438e3e8d9d8c00b308ba4ad937655e9 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/13-chunked-overflow-api-fleet-report-run.json | http | evidence | 0214cb43c42f503368d627d6aff833afc5c28a93e5700155fd45a9fae3f2f685 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/14-chunked-overflow-api-fleet-report-import-csv.json | http | evidence | 7a39e4c246ad2cf2c48a866e71f509773cc9fbbffa1916de30406f7f3ba4d2f3 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/15-chunked-overflow-api-probe-mta-sts.json | http | evidence | 0d74fd6aec191ae1721ed55dd8f52bb2a0ca70ad2ed6f6699a7b1fa7a1ce0b66 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/16-chunked-overflow-api-probe-smtp-starttls.json | http | evidence | 39c0ded3d8d85b4e6f4054a65fa6584d29def81997b7cc710e258621190949a8 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/17-chunked-overflow-api-probe-allowlist-generate.json | http | evidence | 9eff9935286451710387a40bce30992f3171ac77644675e1eee118b97d7bcd63 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/18-chunked-overflow-api-collect-domain.json | http | evidence | a036330b95e0ada1d329a87f88c63650cba33808d1987c8310b7b96feba35412 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/19-chunked-overflow-api-collect-mail.json | http | evidence | c13f79c039abfbbb6cdfcd4c0ed349a9be37394f1a7b9410c0d8a472bec69b1d |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/20-chunked-overflow-api-collect-mail-check.json | http | evidence | 1ba25ff1691376c370c1a55e1985787b0f9588e4ac13674efd807283b01c8ca2 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/21-chunked-overflow-api-monitoring-check.json | http | evidence | 4a124785f31b58ac782ab815847c5c4063968472008be22825a85a65008c1fec |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/22-chunked-overflow-api-monitoring-alerts-alert-1-resolve.json | http | evidence | cc55d1d4eb34bf9f0388a0709a01818bfda554ffa2032311938cd1bda0def0e7 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/23-chunked-overflow-api-monitoring-domains-domain-1-monitor.json | http | evidence | 0774d14592df2f64b1a8ccb252360d98d0e6847d89cd48add357f16cefc52a41 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/24-chunked-overflow-api-notify-webhook.json | http | evidence | cdcb79144b74c378499a5ca458d333f5ba9a312c28d5188c43b50448999ca85a |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/25-utf8-overflow-api-fleet-report-run.json | http | evidence | 20c45a9339d989ac225e4094ec897d37d226e3612b336777565b64d00ed162ee |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/26-utf8-overflow-api-fleet-report-import-csv.json | http | evidence | 9251c983634ee6cb7e663091309d1d1198080f9947391f1bed79b75f6e207eb1 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/27-utf8-overflow-api-probe-mta-sts.json | http | evidence | b398bf68d9cfd8e925cbaed8d5f39b738092bb198dfe0d6c067de2072f18fe06 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/28-utf8-overflow-api-probe-smtp-starttls.json | http | evidence | a0d46cadd46695fe7b36130e910d8af04fd50c6f2d8774515ab1f36f2f39df6b |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/29-utf8-overflow-api-probe-allowlist-generate.json | http | evidence | ff19b792d8ad452f28d78ef69302527f6c05ac74fd4b2b7671504b5b19dbc162 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/30-utf8-overflow-api-collect-domain.json | http | evidence | 62b2876cc2d4c5eeb85de747809d702ebf42edba23c6dc7ee83c3cfb59369195 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/31-utf8-overflow-api-collect-mail.json | http | evidence | efe0c7d1f4985c599b631ca597399b79121f5de3428ea819a58e8edb4d8a100e |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/32-utf8-overflow-api-collect-mail-check.json | http | evidence | 429b262c2e90a40ea894c39d3395ec8632c9f20ca0d9b32235ca9fb535eeb3e3 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/33-utf8-overflow-api-monitoring-check.json | http | evidence | 33dff950c6bce305486a507a94f467dea856c38d0061011a72ac63649ecb9f6c |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/34-utf8-overflow-api-monitoring-alerts-alert-1-resolve.json | http | evidence | 353da22269231eef3dda8b64505759e362606c6a82c87cd6f55aa889f67f7742 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/35-utf8-overflow-api-monitoring-domains-domain-1-monitor.json | http | evidence | 0596a9cf8f043cbff85a8284da41302312c503a3d4ca83e748ecc8d88a6b28f5 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/36-utf8-overflow-api-notify-webhook.json | http | evidence | cd57f4a62d57460ad98a1473b81526f1882d6e79f18bd28347d36799114e2a42 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/37-exact-boundary-api-fleet-report-run.json | http | evidence | 30a28bdb3fc88e996baf481e6b0baf68a013e43fedf5fa06ed14174685fca820 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/38-exact-boundary-api-fleet-report-import-csv.json | http | evidence | 6e77bb8df66b26fe4e0262ea8d1dfa8e021924c66a55853238136c93a8a5ac44 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/39-exact-boundary-api-probe-mta-sts.json | http | evidence | 5e4575b82b3f1122c548ebfc8d8e9e9011661f57aec708a35ff6aaf22805c260 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/40-exact-boundary-api-probe-smtp-starttls.json | http | evidence | 0078453a248f2330544d9e3a731d51b492308d47cd8dcc44a34b6a0505fb07fb |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/41-exact-boundary-api-probe-allowlist-generate.json | http | evidence | 4dfdda005b4a3be24c93a73a9445bd9f9602de49a0f7bf3c06a1ece087e3ddc8 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/42-malformed-under-limit-api-fleet-report-run.json | http | evidence | 7dd84dac41e8c671ac1d22b4464a7666fd5bf3a78d56493d12de575e0ea2e2ec |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/43-malformed-under-limit-api-fleet-report-import-csv.json | http | evidence | fa996d3e267094a670716006efef469d08aa993e1a41aec4d1bdc15e0593e072 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/44-malformed-under-limit-api-probe-mta-sts.json | http | evidence | 23287f0c5cbc3ef3085376bb80b7ba355ad97198957b5d244c606d84538888b5 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/45-malformed-under-limit-api-probe-smtp-starttls.json | http | evidence | a1eb483b623f79495302d3b609696e0ff50051a0b316d3a23f6eadf05cd6c2ba |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/http/46-malformed-under-limit-api-probe-allowlist-generate.json | http | evidence | f59ae6003f8be5c8e958b27b876ae45d8c895e3ede82f75f4b502bec1343b377 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/observations.md | md | aux · unrecognized .md | fe09c847cfba90fc6443cea7977e4c7c7a65b5c02520a25fe942b7e1615c4659 |
| verification/runs/20260903-181715Z-d1cf098-collector-request-body-limits-fresh/readback/request-body-limit.json | readback | evidence | 916b2a2e19585ff4ae4948b308dd23594207889d0d585d42095e19618ebbf80a |
