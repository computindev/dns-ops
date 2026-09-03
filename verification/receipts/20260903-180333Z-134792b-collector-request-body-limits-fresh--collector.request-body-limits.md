---
receipt: verification-receipt/v0
run_id: 20260903-180333Z-134792b-collector-request-body-limits-fresh
feature_id: collector.request-body-limits
profile: critical
surface: api
sha: 134792b74b9ef581c0516a32abf02defd7f5f20e
code_digest: 751e5a37bc32e3e50d16be0de0bdf407634cfe1bd23641f1886daa7af3b5b214
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: ""
evidence_dir: verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh
created_at: 2026-09-03T18:03:52.881Z
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
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/env.txt | env | aux | f6bd16545da60e8e23798c753ef2872d45dfa3cf487c9101a9da175062bd0ed2 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/01-declared-overflow-api-fleet-report-run.json | http | evidence | e875ebfa389a8ea8bc2ff53733bca9efd2aee107f6f86cfea4551146c1c7fcac |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/02-declared-overflow-api-fleet-report-import-csv.json | http | evidence | a8922dd95ef8b43f6c7f5ff1f3e8e3d54de3686cf23f3e4f26984d1f04bde09d |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/03-declared-overflow-api-probe-mta-sts.json | http | evidence | 71f9ffd5e99739ce220dda4856134def0fdd7f687ddc7cf8200a0e4858de76dd |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/04-declared-overflow-api-probe-smtp-starttls.json | http | evidence | 2c21108173650ec212405bcf38877af2e6f6134ede1fd3588a44020d55d04053 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/05-declared-overflow-api-probe-allowlist-generate.json | http | evidence | c892861505838b286541a19e9ef0ee8232b191c7eeef72364d95b1a9c581868f |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/06-declared-overflow-api-collect-domain.json | http | evidence | 257122152e7e128d92cd26598f251b6beecfbf0181790c7ecc33fe232bbfd114 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/07-declared-overflow-api-collect-mail.json | http | evidence | 5c3d48055ef3a735b093ad4057b98177f1c31280c859e092982bc495b17bb116 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/08-declared-overflow-api-collect-mail-check.json | http | evidence | ac541cffbc6f933024ec0a580491274ec29b7f8a451fa42b73b48c85d2ea415b |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/09-declared-overflow-api-monitoring-check.json | http | evidence | a5f6d534256b7912337c40d1bd9c1912677ee9884030caa7534f58da3adac651 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/10-declared-overflow-api-monitoring-alerts-alert-1-resolve.json | http | evidence | 59b9cd53097998df827fd2321398d0cae95b7b10c8b3de472dfd6adfd688af2c |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/11-declared-overflow-api-monitoring-domains-domain-1-monitor.json | http | evidence | d2f09ea20c4baa02efdaae0fda37945eb030c0216db145411e565b18f61426be |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/12-declared-overflow-api-notify-webhook.json | http | evidence | 1f1589f356e1dc75db6d6c4f6528757cee2c63aa55e2cb965b49ef9df60bbeea |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/13-chunked-overflow-api-fleet-report-run.json | http | evidence | ce50a6788fc319d7e11ecc8fe79702c5e3f6d104efa6b092683435ed42b52dcc |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/14-chunked-overflow-api-fleet-report-import-csv.json | http | evidence | 583935fc2e7039e43d79a127f8ad933607caca70a06bb958b64938a7be9a18a8 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/15-chunked-overflow-api-probe-mta-sts.json | http | evidence | e39b9f21a926da235e7f616c2e143f041df8a959360bb1206998739cb64ad21b |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/16-chunked-overflow-api-probe-smtp-starttls.json | http | evidence | f7202caebc71eec7edb2148061143b97d70a7efe96f9a549f2ed34f0874886e7 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/17-chunked-overflow-api-probe-allowlist-generate.json | http | evidence | 1af329446c797dba6a6372dda46dfcf25928315c81426216f3631db84a02fcc0 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/18-chunked-overflow-api-collect-domain.json | http | evidence | c4c821d2a5dbfcddf1f235a1a85190535dd9ac28a091993af208b2fb4456c695 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/19-chunked-overflow-api-collect-mail.json | http | evidence | d485951b4fad1e5af6468b2536b01f73a40f60f47d56c21f30ca87306e9132e9 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/20-chunked-overflow-api-collect-mail-check.json | http | evidence | 1c7771bc6e69e654e5095aff156966d1698ce1d04722f163d1878f845b484c18 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/21-chunked-overflow-api-monitoring-check.json | http | evidence | 6b1f3e30b5c85731138a7f11551751ff96cdfa2a222c211544d05cacbb1f10b7 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/22-chunked-overflow-api-monitoring-alerts-alert-1-resolve.json | http | evidence | 06531f2d5c0489b1995de33c7766acea37e24a9bf0fd762124b02147a8225b41 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/23-chunked-overflow-api-monitoring-domains-domain-1-monitor.json | http | evidence | 323bad2fd23e23d62aa42180e8677d55cff17d59f66bb8de71a4148ae280c680 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/24-chunked-overflow-api-notify-webhook.json | http | evidence | 8ea53b3988533a968ccdde4a746295c8d2130c09efb75b1f95c8ee8e4eac9e5b |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/25-utf8-overflow-api-fleet-report-run.json | http | evidence | 157b24aface38fc761be3d1bbb3cd95ce37c84511db618f2b418aa2bccb4b5d7 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/26-utf8-overflow-api-fleet-report-import-csv.json | http | evidence | eae63f39927cc4c4f10caba9a4aa60254999de13f829bdb3a00c6726d4ea67d8 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/27-utf8-overflow-api-probe-mta-sts.json | http | evidence | 70dbf51651e7d36ae0b24fa70cebef1ea3ef2dfd0ac89e8288e8f76b3871c34a |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/28-utf8-overflow-api-probe-smtp-starttls.json | http | evidence | 7691ba9910c4a1b695e891fe6644f993708c056298e1440cb49e384fc77e997d |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/29-utf8-overflow-api-probe-allowlist-generate.json | http | evidence | 9e2ff432d29e8b8b87c2aae419923c9a577fec9bee0709b44110051a99367c4b |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/30-utf8-overflow-api-collect-domain.json | http | evidence | 125a7bf882a235da065480ad49e9c5e8793277faf1c6a02d63c19460ef9a20f6 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/31-utf8-overflow-api-collect-mail.json | http | evidence | 0885ac93960fe320c5dc980d04b0deba109553497eeec93f9d1ac1f5b9a09aef |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/32-utf8-overflow-api-collect-mail-check.json | http | evidence | c4b5ef97ace361f2849a18d07b48580f795fac57add44281467f2d6ebea42728 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/33-utf8-overflow-api-monitoring-check.json | http | evidence | 0b4e548b89f79a51058067172fee61823b352c42c7d16a42be9f3baea09a5496 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/34-utf8-overflow-api-monitoring-alerts-alert-1-resolve.json | http | evidence | 68472e788cd738e71416f08a6e7524ce6b9de7ac6aa907da81fceee0022c0075 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/35-utf8-overflow-api-monitoring-domains-domain-1-monitor.json | http | evidence | 5ca869a3ad7421ddc3a426f9621ab092026218747665d3fff9101892a067dafb |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/36-utf8-overflow-api-notify-webhook.json | http | evidence | fe6bbcf3190344e0bc96e8ef239cd057e10707395b8c117c458e56eaf03adb43 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/37-exact-boundary-api-fleet-report-run.json | http | evidence | 868869a22db0f04253bacdcbbf74cc7f58d863c91a9ebb3d120622b66266b971 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/38-exact-boundary-api-fleet-report-import-csv.json | http | evidence | 810ea0c628cb1826c37a7d44ba7c09663f88e999e403120bde624e490bb4240e |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/39-exact-boundary-api-probe-mta-sts.json | http | evidence | d9a74483d2204321dbb7453e76c210f42ec3abba63da8867315e2b1e040ae5ff |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/40-exact-boundary-api-probe-smtp-starttls.json | http | evidence | 39bd3c26cdb3d48f177182de0c3821e000fa7ad00eaad44733d697144d95a486 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/41-exact-boundary-api-probe-allowlist-generate.json | http | evidence | af75e972d0d5abb0d34650bfb7ac2b3604a5962a84608af060230628f64e74fd |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/42-malformed-under-limit-api-fleet-report-run.json | http | evidence | 89309150d161295e757ce3f410966c4befcabe1f1bec814e9ec9df96248846e2 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/43-malformed-under-limit-api-fleet-report-import-csv.json | http | evidence | 2931bc7e1f9a210a3e1c94665b1aeaa94f173b9e8ccb715e63623a202051f183 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/44-malformed-under-limit-api-probe-mta-sts.json | http | evidence | 4cca47e00f329260c131a67498909c1371d1ef02bc8e49e68af3a376439a5965 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/45-malformed-under-limit-api-probe-smtp-starttls.json | http | evidence | d49da11d69f5f37c5807e4db7811e9943312161436165c66354ad4ec996685bc |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/http/46-malformed-under-limit-api-probe-allowlist-generate.json | http | evidence | 0b7b03a802c7eee59c53e4066648142760144df443fae70f3075905c8ebe1f0b |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/observations.md | md | aux · unrecognized .md | fe09c847cfba90fc6443cea7977e4c7c7a65b5c02520a25fe942b7e1615c4659 |
| verification/runs/20260903-180333Z-134792b-collector-request-body-limits-fresh/readback/request-body-limit.json | readback | evidence | 916b2a2e19585ff4ae4948b308dd23594207889d0d585d42095e19618ebbf80a |
