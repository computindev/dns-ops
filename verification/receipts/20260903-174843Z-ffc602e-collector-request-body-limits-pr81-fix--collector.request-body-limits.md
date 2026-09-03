---
receipt: verification-receipt/v0
run_id: 20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix
feature_id: collector.request-body-limits
profile: critical
surface: api
sha: ffc602ecee2d2d2772e030a35c61914b25ce2451
code_digest: 751e5a37bc32e3e50d16be0de0bdf407634cfe1bd23641f1886daa7af3b5b214
dirty: true
untracked: 0
status: passed
reason: ""
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix
created_at: 2026-09-03T17:49:01.494Z
---

# Receipt: collector.request-body-limits — passed

## Observations (expected → seen)
- All twelve production POST collector routes returned exact 413 JSON for declared and streamed overflow; harness recorded 46 exchanges.
- UTF-8 byte overflow was rejected; exact-limit requests preserved normal validation (fleet run/probe 400 and CSV import 200).
- Malformed under-limit payloads preserved existing 400 validation behavior.
- Stream cancellation and sentinel-consumption bounds matched the feature proof.

## Forbidden (expected absent → confirmed absent)
- No route-specific 413 body, extra fields, provider call, or route execution after overflow.
- No character-count limit or rejection at exactly 1,048,576 bytes.

## Read-back
- verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/readback/request-body-limit.json contains the per-endpoint response/status, byte, pull, cancellation, and sentinel matrix.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/env.txt | env | aux | 17231122a0f51b7654af6b5d5c70d820ca84e20a4b372040491fc6c4c78ca375 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/01-declared-overflow-api-fleet-report-run.json | http | evidence | c4d86e24f724aaa947ab0ba1df54c6377a3c9e60bad09e4c6401219a5cfcb188 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/02-declared-overflow-api-fleet-report-import-csv.json | http | evidence | 5566daab689905550e6bba7dd11c28044aad61cf73be68ac4cb4f35e2117273e |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/03-declared-overflow-api-probe-mta-sts.json | http | evidence | fbe0b19b8068c1e089ae23bcd171a1adb0a6a58c40f72d55d3ce15e1a5bc6b5e |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/04-declared-overflow-api-probe-smtp-starttls.json | http | evidence | 859ec702649e7bd44a10bc3a3ef4fab04b7bf39b238444a9000f12e4a3132e2f |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/05-declared-overflow-api-probe-allowlist-generate.json | http | evidence | 1df4c514ea959615cf9fa9202f185242026d7618924f9b9563a8a594ee81dcbf |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/06-declared-overflow-api-collect-domain.json | http | evidence | 66bf138d8ea7042a79fa0c4ed0e4cc5e5f03d640888dec7cc2b537f369fb6470 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/07-declared-overflow-api-collect-mail.json | http | evidence | 7064879b6fa526d9a67fb3513b8d6aeb76d1de894988b6f9a1eb53281149bb0b |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/08-declared-overflow-api-collect-mail-check.json | http | evidence | c6f605caf589f13dc6375f582f4cdba172c027f4c186161a96eb8527e6233fa5 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/09-declared-overflow-api-monitoring-check.json | http | evidence | c8d4b3fbac9569f7f6b49a73e273ad410ba9ca857498834609d3819ad7c10ab6 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/10-declared-overflow-api-monitoring-alerts-alert-1-resolve.json | http | evidence | 76d1c338f6918fc459d31b76ce5af755d881d16ad1c0bf87bb0b28f63a976c85 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/11-declared-overflow-api-monitoring-domains-domain-1-monitor.json | http | evidence | ea1b845f26bc3f3016b3f1fbd45a4aff186eecb65e47ccf7d912c562ee0d31b6 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/12-declared-overflow-api-notify-webhook.json | http | evidence | b3d479b8fa697ace2e00abd03821b1a361e481aac07f8c8020183c5117e82a2c |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/13-chunked-overflow-api-fleet-report-run.json | http | evidence | 9abe648006c4cb1002b3d679c0f6561390fb1d63b73d4ae62871a2ccbcb3bc28 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/14-chunked-overflow-api-fleet-report-import-csv.json | http | evidence | 13ab2a557a3c49f27c5e3bd7898668d3f0d9e77e162370641a247d712af163ef |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/15-chunked-overflow-api-probe-mta-sts.json | http | evidence | 14c32993f098a6a6a27fcf0f5e6038548c291277174b7cc002bee1a0a7d15ca3 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/16-chunked-overflow-api-probe-smtp-starttls.json | http | evidence | f9e36ead76686d55d4482383fcd576c07cacc2ebdb47c19548226ebaefbaec69 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/17-chunked-overflow-api-probe-allowlist-generate.json | http | evidence | a5a751ae1191e66da0041b0ac6bfb7723a16ec2724ad6a3f82e2d6600259429e |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/18-chunked-overflow-api-collect-domain.json | http | evidence | e9f17d4d9cc569fa34cadaef5a16f3224916484ea12be0ed2f841b91b2f31466 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/19-chunked-overflow-api-collect-mail.json | http | evidence | eaf98705d94de7b6794ee5c317f8cd2b4fbc19e4f21ece928c937056b489ff4b |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/20-chunked-overflow-api-collect-mail-check.json | http | evidence | be179674a8884c862e9a4c5388bb00cbc0e20ed6ae52630f00f9a9d73329746d |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/21-chunked-overflow-api-monitoring-check.json | http | evidence | 54ccf60b3580f2ca1f646d4ffe561b47b368eee258390a1d7ed8cf8a1bb9b7aa |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/22-chunked-overflow-api-monitoring-alerts-alert-1-resolve.json | http | evidence | 226e2b8f657323aaf14566c18890911896e7993ebfe2f8d78412831689991f83 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/23-chunked-overflow-api-monitoring-domains-domain-1-monitor.json | http | evidence | ad1b14a136df906110ce350f0fe30554f4f7cba4f4ab1d638af65151673da33e |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/24-chunked-overflow-api-notify-webhook.json | http | evidence | 1e1d08e90901faa3c5ef84df87619c80ef637b20162821e3f4d1067f08339428 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/25-utf8-overflow-api-fleet-report-run.json | http | evidence | 1c71fb236bc026ee155f769218fa6350461d3669871aae9b995ead5b9186da1f |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/26-utf8-overflow-api-fleet-report-import-csv.json | http | evidence | 18b1624c76d6901bb7ad34e4cddf252dc1d247f963f5b46d1cf3479fe12f07b2 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/27-utf8-overflow-api-probe-mta-sts.json | http | evidence | 3e20d28b01ddbe89b1dcb37f674cb8b0236bc4d6b8fde1a5aed791197d1bb684 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/28-utf8-overflow-api-probe-smtp-starttls.json | http | evidence | 430eb52a2cfccb6bb01eb8fa17a2fb3d77c43043c2d644927c3a87f3f9bb5515 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/29-utf8-overflow-api-probe-allowlist-generate.json | http | evidence | cb4e86b31244a4814ef9397c0fbefec618d4b5187e33315f20a9967fe09ca5e2 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/30-utf8-overflow-api-collect-domain.json | http | evidence | b66d5d970d658bcc200c68de0528275764ab6ea310b72a82f538966d4449c92f |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/31-utf8-overflow-api-collect-mail.json | http | evidence | a5b2baa47ca27b2c8d9bb9326aed4cc15d5033b10372b0293ec25ffcdd180822 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/32-utf8-overflow-api-collect-mail-check.json | http | evidence | 4b190eeee335874dccf40c83068944ab215f6db8653bb653af1d5beada0c216d |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/33-utf8-overflow-api-monitoring-check.json | http | evidence | b5f7d727a9163f336fe0a7e1c4864e6b6c45f0f70873031510a471048aaab6b0 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/34-utf8-overflow-api-monitoring-alerts-alert-1-resolve.json | http | evidence | f955c43727dd8395c2050794f59ab2fd187ea740f215faf6f1865ab81dc4a900 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/35-utf8-overflow-api-monitoring-domains-domain-1-monitor.json | http | evidence | 8e3ed010e16631db17ab04e439fb5f30b8651743bd8c5b1abc9fbdcfb22065c2 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/36-utf8-overflow-api-notify-webhook.json | http | evidence | b3cf556f1db5435e7fc2d8f1baa0592e753ecdafe29a035d942dc080ba763f7c |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/37-exact-boundary-api-fleet-report-run.json | http | evidence | 9eb66cf5077956395bac6ad6b563f31300bb6f7b1b3aba20314224cad3612c8c |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/38-exact-boundary-api-fleet-report-import-csv.json | http | evidence | 80abebfb3612b43dde1381c9882ec358ed1639c8fb3d7b9f667a29e47d49b9e5 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/39-exact-boundary-api-probe-mta-sts.json | http | evidence | a87128e7d0a13cbcb96f8e044c41ce84e17946f737792df8b5961b7b1ffda9bd |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/40-exact-boundary-api-probe-smtp-starttls.json | http | evidence | c8123750838947db6e49e8700c9b5a17024f27d392fc7a3f3a0d5f822eb831e7 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/41-exact-boundary-api-probe-allowlist-generate.json | http | evidence | 844f1bd19bdf41cc5937b3c66561a5a7c81fd094e4e3c8615b090958631aca1a |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/42-malformed-under-limit-api-fleet-report-run.json | http | evidence | 8f2b85f8905a698eed94f9402e9a84f0a7ef1db8a94f4c80e516d214a2d4c3ec |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/43-malformed-under-limit-api-fleet-report-import-csv.json | http | evidence | 67040e61f430a4873b29991ba870cc866c6e4108952b42c1ae6069d9442119b1 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/44-malformed-under-limit-api-probe-mta-sts.json | http | evidence | aaf0913705f5e46d8bd363d246196ccbb229551426fd0535a80e65f537c9aa8a |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/45-malformed-under-limit-api-probe-smtp-starttls.json | http | evidence | 6281eb95873d74df5cfae9c539f9c6ac3ff25392987fe0e571371ead7284ba72 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/http/46-malformed-under-limit-api-probe-allowlist-generate.json | http | evidence | 6fff605305feb004062e56f038d1e1fc48e690d1334c2f4d2a7f42faea3268d7 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/observations.md | md | aux · unrecognized .md | 28e273a13958016a732f9816f6426ff51e67f618f3c97db05761c501996b2d58 |
| verification/runs/20260903-174843Z-ffc602e-collector-request-body-limits-pr81-fix/readback/request-body-limit.json | readback | evidence | 916b2a2e19585ff4ae4948b308dd23594207889d0d585d42095e19618ebbf80a |
