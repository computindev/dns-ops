---
receipt: verification-receipt/v0
run_id: 20260903-045625Z-3cfa056-collector-request-body-limits
feature_id: collector.request-body-limits
profile: critical
surface: api
sha: 3cfa056dc1bd9e111ce6df8a2d01763b0f8cbbb9
code_digest: a0e7357bc8da30ed943c2d4374b3d2244c6da307c3665f6ee2b99085274e6b21
dirty: true
untracked: 0
status: passed
reason: ""
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits
created_at: 2026-09-03T04:57:34.080Z
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
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/env.txt | env | aux | 9c7edc0cea66330181b59a11466e36d2f26adede8090f0df4ec0d9a6f75bf311 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/01-declared-overflow-api-fleet-report-run.json | http | evidence | f6512bd340e67a5f81da10d060f5bceead1ef7af44c0c03734e11beb2181e15e |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/02-declared-overflow-api-fleet-report-import-csv.json | http | evidence | 6424e4f7d4e088cca94bf813cf7405023af1c3e598fce801a61ab0f0ceaba38e |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/03-declared-overflow-api-probe-mta-sts.json | http | evidence | bdc0d09874147c2cec307b8f0cec09d12ae0692caa5ed468f0fa001e87e0aab0 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/04-declared-overflow-api-probe-smtp-starttls.json | http | evidence | b7dc9767348afccc3089e13c5d2f85099b6f7032069591099675d7fcb50f7579 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/05-declared-overflow-api-probe-allowlist-generate.json | http | evidence | 6c13407665179539f4b5940dd24f9b7b4a5bf65f3a0ca62f73c49c5919d00541 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/06-declared-overflow-api-collect-domain.json | http | evidence | 1f6a6cc07f7c2b9d05ff39f72a271adeb44fac2675d86dbda2c93aa18a608694 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/07-declared-overflow-api-collect-mail.json | http | evidence | 1c8e7c307655548c92e8404d7a1c5fcb51397b0068390870783dd8c5bbb5f794 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/08-declared-overflow-api-collect-mail-check.json | http | evidence | 3c16ffe66495632ff3331bc25c0557b3c72a06628959794977696dbbd70dc8e5 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/09-declared-overflow-api-monitoring-check.json | http | evidence | f324f031e30676326678708869261031de240c315f9f8627338d7724d9421cf2 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/10-declared-overflow-api-monitoring-alerts-alert-1-resolve.json | http | evidence | 3c841dccc0c61c2af8621b25148f027810d30bc273537fc7841a5bc9ce0387ac |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/11-declared-overflow-api-monitoring-domains-domain-1-monitor.json | http | evidence | 854663492d8bcf6fd2f5a47fc12c8fc821869ab4d5ae76439ab4adb46d43e678 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/12-declared-overflow-api-notify-webhook.json | http | evidence | caaa87c99fb9084fba1526bfb1b15f87ab13401c449571e2914bb14f1c77f15e |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/13-chunked-overflow-api-fleet-report-run.json | http | evidence | 6a22a47cd7e95e0affdbd71144131890dfdcf07ba7e1abb20da30c3b25e9765e |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/14-chunked-overflow-api-fleet-report-import-csv.json | http | evidence | 2af2ee65292b93fb0173d6b7077e6198a58b6566a9ced6efc6b484fcc439bba7 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/15-chunked-overflow-api-probe-mta-sts.json | http | evidence | 86e16494e3d1e4f66cf1be0cb8ea4fcecd600b02d9b79a7e15b01de43dd0fdf6 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/16-chunked-overflow-api-probe-smtp-starttls.json | http | evidence | bebbd7028d88b9f7340b7da24158b815a8a2c3b6e1ee9e075bd990d47490673e |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/17-chunked-overflow-api-probe-allowlist-generate.json | http | evidence | 566f1ac4d6c66bde729f55f1fc8a6a32d8360f20caf8fddd7506f2256743e23a |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/18-chunked-overflow-api-collect-domain.json | http | evidence | e243b67c564ffaf75fa99d1db5a3607ea1b0da881f050207f11f4e341718468e |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/19-chunked-overflow-api-collect-mail.json | http | evidence | d05528b18544807c084b976f0f83eea8afc8de125abd9d9c7e17bdd9f036e801 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/20-chunked-overflow-api-collect-mail-check.json | http | evidence | c13a2d7c813542b3bf4ada3224d3800cc949f1401cb75633cd10da0fce5ca1a0 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/21-chunked-overflow-api-monitoring-check.json | http | evidence | 7588bbb1f685553fcf5d383da26a1aa3b15ac6290c75c048ef2a63618edb37d0 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/22-chunked-overflow-api-monitoring-alerts-alert-1-resolve.json | http | evidence | 872eb46c813e154abe88c7e71b7ed4d64e6430fcd3daa1d02ef63655ec7cf29f |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/23-chunked-overflow-api-monitoring-domains-domain-1-monitor.json | http | evidence | 629291d70103e1a2769a7b1d21aa1100c95a8098eefae61a254bb437c339ac19 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/24-chunked-overflow-api-notify-webhook.json | http | evidence | ab0d6c71fb117e5826f03c31276bafa5c081545afe4bd15fee5a871391d5343e |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/25-utf8-overflow-api-fleet-report-run.json | http | evidence | 819c39f9c8813589796ee2bc939a3bad4772e43fc168c1eba47cb1d7514b9f70 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/26-utf8-overflow-api-fleet-report-import-csv.json | http | evidence | adec4f46b3e70c5529a5387cd658fc5bbe805ec32bac84378e14278424979791 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/27-utf8-overflow-api-probe-mta-sts.json | http | evidence | 0b1ec75017614c331359b08a893bc78ad10fcfb8dc846021a412a3ffab9d8c4b |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/28-utf8-overflow-api-probe-smtp-starttls.json | http | evidence | 9bbb1a180012b58e36fcdcb6bc307194c780cdccb30e8dc5bb8785921a6fc2b1 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/29-utf8-overflow-api-probe-allowlist-generate.json | http | evidence | 51509e91ba7dac716d383bfa3406d53876cec18e9f5ff75e334a97a99b6fc635 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/30-utf8-overflow-api-collect-domain.json | http | evidence | 92351a6f24fb7b3bc305182a71c68e3ca2e2670e065de3da0144cf5d85f3ee49 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/31-utf8-overflow-api-collect-mail.json | http | evidence | 149d0c3dca99d1e2a6395c9661d372883bd9995474b45325e3ff20eb4f3d0ad6 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/32-utf8-overflow-api-collect-mail-check.json | http | evidence | 08a57e0c308150d1a8d27f421cbe1f5cad57bd23002b9294c482ffe4e0d4cdaa |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/33-utf8-overflow-api-monitoring-check.json | http | evidence | 33e185ecd220bb285f9b44de98a38410ca6e28f5d34794582b9915258d45b5ed |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/34-utf8-overflow-api-monitoring-alerts-alert-1-resolve.json | http | evidence | 08ed17feb378e6a6aea3a6a7c76c90cbc5def6cf3ee649af4cc3dc20328c2e42 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/35-utf8-overflow-api-monitoring-domains-domain-1-monitor.json | http | evidence | b905858d318ed36af205a2d21fb70e278d79eef63aa57e36687e89b75f009b57 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/36-utf8-overflow-api-notify-webhook.json | http | evidence | 257c5ed74588e09c9b64561ac9cf9dfaba4d15f44e8a93addf440262bb8a6c0b |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/37-exact-boundary-api-fleet-report-run.json | http | evidence | faa257674a683877640a24fe499e90aec7bdf34ad8cc5b2294972fff97ca66f6 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/38-exact-boundary-api-fleet-report-import-csv.json | http | evidence | 3a7dab5bcdae833d0aba5859d00ab7ed0293191c16ab206b33c17b9d77acc0dc |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/39-exact-boundary-api-probe-mta-sts.json | http | evidence | 1e644f7665820a8fbe902c43ba142d45e4da977e59fb1372e2e03d1974a69c8d |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/40-exact-boundary-api-probe-smtp-starttls.json | http | evidence | eb99f134bf928ab07807256a8d5facf0778df79840ea7998050d2a8463f8cd14 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/41-exact-boundary-api-probe-allowlist-generate.json | http | evidence | 1fd9fba648779562712a84d9e16afe3e42ba29c61b9fb4d4cfb358e72792d995 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/42-malformed-under-limit-api-fleet-report-run.json | http | evidence | 101488a8b87802d7307252de4b2578f9708562847d573eea8e8c061dbe9e35b0 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/43-malformed-under-limit-api-fleet-report-import-csv.json | http | evidence | 68cafad39f838e04d68dab59cfb2e07126865400918b8e991f437319c2d8ddb2 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/44-malformed-under-limit-api-probe-mta-sts.json | http | evidence | 98f3de84457035c8acb2a77fa2e30d716b5f0118a75b3a724266c96732e95048 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/45-malformed-under-limit-api-probe-smtp-starttls.json | http | evidence | 0ea0fe0db1b796639e7f05547b5451fbc413c4087782e5b95a1b7e502077b6b3 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/http/46-malformed-under-limit-api-probe-allowlist-generate.json | http | evidence | 99d03c5391388f42b1b97bfc782732b940638a066edca391ba5b960c7e5bbcdd |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/observations.md | md | aux · unrecognized .md | fe09c847cfba90fc6443cea7977e4c7c7a65b5c02520a25fe942b7e1615c4659 |
| verification/runs/20260903-045625Z-3cfa056-collector-request-body-limits/readback/request-body-limit.json | readback | evidence | 916b2a2e19585ff4ae4948b308dd23594207889d0d585d42095e19618ebbf80a |
