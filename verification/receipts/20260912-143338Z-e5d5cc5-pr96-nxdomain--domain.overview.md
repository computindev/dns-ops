---
receipt: verification-receipt/v0
run_id: 20260912-143338Z-e5d5cc5-pr96-nxdomain
feature_id: domain.overview
profile: changed
surface: web
sha: e5d5cc5b1cec3172ce62bd92ca642c5ad96c9c11
code_digest: 516dd7d289693908343b9a175a31d096ba2367a4fa170db104233a41d7b399da
dirty: false
untracked: 0
status: passed
reason: ""
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain
created_at: 2026-09-12T14:37:55.054Z
---

# Receipt: domain.overview — passed

## Observations (expected → seen)

- After local e2e headers (`X-Dev-Tenant=dns-ops-e2e`, `X-Dev-Actor=e2e-bot`) and **Logout**, filled **Domain name** with `google.com` and clicked **Analyze**. URL became `http://localhost:3000/domain/google.com?addToPortfolio=false`. Heading `google.com` visible.
- Tabs visible: Overview, DNS, Mail, History, Delegation.
- Overview **Evidence completeness** region: Coverage “Needs setup/evidence”; “Rule evaluation coverage: Complete.” (`data-state=complete`); Findings group `data-state=known` with “8 current evaluated-ruleset findings recorded.” Query stats (42 / 10 / 32) appear after that region. Partial collection copy: “DNS collection is partial, so evidence completeness is UNKNOWN.” No healthy-zero language.
- DNS Parsed view: 8 tables with **Remaining TTL** and **Estimated live at** headers. 42 body rows, none blank. 7 live rows with `Ns remaining` + `<time datetime>`; example `google.com` NS `17030s remaining` / `2026-09-12T19:20:23.000Z`. Rendered deadlines matched persisted public-recursive evidence (`readback/dns-ttl-audit.json`).
- Mail tab findings cards rendered. `GET /api/simulate/actionable-types` returned `supportedTypeIds` including `mail.no-spf-record`. Live google.com findings did not include those missing-record types, so no **Simulate** sibling appeared; unsupported/non-matching findings stayed visible without that button (`readback/actionable-types.json`, `domain-mail-buttons.png`).

## Forbidden (must not happen → confirmed absent)

- Did not remain on `/` after Analyze with a valid domain.
- Did not render a healthy/success zero-finding result under partial coverage (coverage stayed UNKNOWN / Needs setup/evidence despite 8 findings).
- No CSS-class driving; roles/labels used.
- TTL cells were not blank; live datetimes matched recursive evidence rather than averaged TTLs.
- No Apply/provider-write/projected-resolution control was rendered on Mail.

## Read-back (side effects checked through an independent path)

- `GET /api/domain/google.com/latest` snapshot id `b1b1655c-d21d-4bdc-809d-e68f660ff966`, `resultState: partial`, `metadata.dnsQueryTimestampBasis: response-received-v1`.
- `GET /api/snapshot/.../findings/summary`: `evaluationCoverage.state=COMPLETE`, `findingsEvaluated=true`, `total=8` — agreed with the Overview hero `data-state`s (`readback/findings-summary.json`, `readback/domain-overview-drive.json`).
- Observations + TTL audit: successful public-recursive answers; 42 rendered rows matched persisted record sets (`readback/dns-observations.json`, `readback/dns-ttl-audit.json`, `readback/dns-ttl-cells.json`).

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/collector-doctor.txt | txt | aux · unrecognized .txt | a470f10a5b24aaf097938a7cdaf90ee24d0a5825e77a61ed6abff0b4e54ec8e0 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/console.log | log | aux · unrecognized .log | b92627f04ef0e2228be0467075e659164bad2016faa90d2ba02ac011871f25ff |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/debug-domain.mts | mts | aux · unrecognized .mts | 59bb09f70ef72ac7acbd7abd75d3777895334fe09f0af910a69c23ab0748801c |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/debug-domain2.mts | mts | aux · unrecognized .mts | 87941405b69713276c5257ff9810908953a2d2d4a5f65c7060603890cbf145a3 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/debug-nav.mts | mts | aux · unrecognized .mts | 5dfb29d576ae3426cbf0fa0f4b0b67300b65765ee14daaaa9f87af918cd6a3ee |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/debug-portfolio.png | png | evidence · 1280x3825 | 7bfe44630d34d277eedb2891d35b2fa3c0259039f09cc5ede98a86063d589981 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/domain-dns-parsed-ttl.png | png | evidence · 1557x3888 | 943e170125318b2864f9508eea0cb5f08847fcfb004263692772ed77b0329338 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/domain-mail-buttons.png | png | evidence · 1280x720 | 270aefdd56e9c2ab4e74e36d58bf23965db8ad5d4b64ae909ffb2ab2c0c57c8f |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/domain-mail.png | png | evidence · 1280x1887 | f11ef0af8b770de7557fe452463eb69fe41dad71eaffa9172d0e6c908c7a437d |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/domain-overview.png | png | evidence · 1280x2584 | 3a53ca5288238b1e59747dfc8232b64ce5cca5935fa78e71c58198032d147ea6 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/drive-mail-simulate.mts | mts | aux · unrecognized .mts | e4ddf961ed8e0f20d381fc2e520b02a8496a0e502c185961a9ef52b099736ca2 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/drive-pr96.mts | mts | aux · unrecognized .mts | 47d79124a7384adc52df13fddc6a2b4da47564ae6205b8d1d8590eade064edbd |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/env.txt | env | aux | df847770f8d3f5fc25b795e88af0494b206136fecec385cb89ced3d43104ac00 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/failed-requests.log | log | aux · unrecognized .log | 37e08a5d035f7a4264f11240196a5ff37ea12f9cd930590480f7994f48a535e1 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/fleet-before-run.png | png | evidence · 1280x3825 | a2f152e7e36f274cc1a1623533ab591cf3aedf79d13d3ca6709476510264291c |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/fleet-report-details.png | png | evidence · 1280x4953 | ad755c7870cd61b9364f3661ea7d9767ca38135aaa2420c77bf45291762e8241 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/fleet-report-summary.png | png | evidence · 1280x4755 | f599f79a371312eed03855d8607cc5812ed0f185025dbb0128f78cab5343062e |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/notes-domain.md | md | aux · unrecognized .md | 1b7b69edfbc634bb4dbc2c2d1d496c3db0528b16154d39b02244564e19c1642d |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/notes-fleet.md | md | aux · unrecognized .md | c10554f670bbc28731de595f60266f4bfe9f4225773e9cd3eaf6fc46224ff705 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/readback/actionable-types.json | readback | evidence | eab8c619f285614b052a1d265ef1b51d629b947fcc42327cbc9b09306d1fd09a |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/readback/dns-observations.json | readback | evidence | 70c70db7c1bc43382581bb6e063c75c4c8df4ac2b210680e38071864a6f1785f |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/readback/dns-ttl-audit.json | readback | evidence | a59eabea513306d4bb6122693cf6433061a985de2194919362bd8509090f6fec |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/readback/dns-ttl-cells.json | readback | evidence | 1cac4bc7eadc3a560cc4885e145a9ab14dccd823e7a7575af1cd3c1eebc2eaa0 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/readback/domain-overview-drive.json | readback | evidence | 279e66fb63831b5a4bd96856c18d4b042ecc3a906d2f5c89661c3c36fb6ef330 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/readback/findings-summary.json | readback | evidence | a873b076c6dbe9c06faf4f03742468fcd10e8c86dca0f5e0c0614eb030472546 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/readback/fleet-csv.json | readback | evidence | 736b27fd9ebf290cb35e67ea1788fb0ec2da4789f9b6c6ceb939a32d58623030 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/readback/fleet-fail.json | readback | evidence | 775d7206715e70b990abed98bd35e54170a5488ddb6b03ac186872dc5ae7787f |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/readback/fleet-pass.json | readback | evidence | 83e7e3806be1617b77fbd767173964dbfe9591c4a80beca6997d4dc13047d0ed |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/readback/fleet-stale.json | readback | evidence | b0ff42ae9dd42af76fa73d45265c5b4f12f71e2e1b8fda23a54c10a592d70ee9 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/readback/fleet-ui-audit.json | readback | evidence | e8811a25a0e172beadc59384e6a415e732eb6d7bb2967c497811c7cf804b2ddf |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/readback/fleet-ui.json | readback | evidence | 8ef70ee8e3971dbaf201ca018bffc46c7b9cadba2b2659addcdfb79f59cdee54 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/readback/mail-simulate.json | readback | evidence | 6a894694a4b3a66f33374ba8b15800ddfe49841651a1efd6c73123c502f82519 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/trace.zip | trace | evidence · playwright trace | 7f4b0927ef9c9fe95d16fee2683934a0011ce470d3f102cb74fef6130c6e4533 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/video/065bf38dd1b24afb36f8fa1f9d3f106d.webm | video | evidence | da94265f9a6d2135b7c1f5b60a5ef4563d69ba03f8779216a25f6310f1d8cb96 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/video/385feb703d6bd2e9a306dc5647837cff.webm | video | evidence | 0f0f9b5165b523bf6616e2301a77caf96b926b2a248444668b3177b3d6bccb32 |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/video/6002e67bffbdf37103afd40730a19315.webm | video | evidence | f71168ac933256ce564d0c7f3afbc369c4a1c3a0e701a7edd7a88ebf4cd98c7f |
| verification/runs/20260912-143338Z-e5d5cc5-pr96-nxdomain/video/a3bba9d7a98d23736deec5acacc08c61.webm | video | evidence | 2b4e93e0164750b4ff0e91484ef416466b5ebea232858253c364fec4affb1c78 |
