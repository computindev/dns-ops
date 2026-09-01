---
receipt: verification-receipt/v0
run_id: 20260901-093035Z-f8254dc-final-domain
feature_id: domain.overview
profile: changed
surface: web
sha: f8254dc9143c8e12dfa7b2bc8e38f9bf7109715e
code_digest: ba8b0a0068efbcc82e351a6db480d965fd98f511c5aec310c888b56f74879a6f
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-independent-final-f8254dc-domain"
evidence_dir: verification/runs/20260901-093035Z-f8254dc-final-domain
created_at: 2026-09-01T09:39:39.273Z
---

# Receipt: domain.overview — passed

## Observations (expected → seen)

- Independent fresh verification used exact product SHA `f8254dc9143c8e12dfa7b2bc8e38f9bf7109715e` from a clean isolated worktree. Local web and collector services ran from that checkout on ports 3320/3321, with a dedicated disposable PostgreSQL 15 fixture on port 55468, `ENABLE_ACTIVE_PROBES=false`, and local development tenant headers.
- Doctor/readiness passed. The real home-page Analyze flow reached `http://127.0.0.1:3320/domain/google.com?addToPortfolio=false&tab=dns`; the Domain 360 heading contained `google.com`, and Overview, DNS, Mail, History, and enabled Delegation tabs were visible.
- The persisted `google.com` snapshot was `20000000-0000-4000-8000-000000000007`, carried `dnsQueryTimestampBasis: response-received-v1`, and had one successful public-recursive observation with identifier `192.0.2.53`. The Parsed DNS view rendered exactly one matching `google.com` A row.
- The rendered row populated both timing cells: Remaining TTL was a non-empty seconds value and Estimated live at was a non-empty machine-readable time. The independent TTL audit matched the rendered deadline to the persisted observation's `queriedAt + TTL` and matched the countdown within the harness tolerance.

## Forbidden (must not happen → confirmed absent)

- No blank TTL cells, averaged-TTL estimate, all-UNKNOWN output, invalid live value, CSS selector, coordinate click, fixed sleep, provider call, live DNS query, or active probe was used.
- Browser routing allowed only the local web service; blocked external font requests were not used as evidence.

## Read-back (side effects checked through an independent path)

- `readback/dns-observations.json` records the API observation read-back, including the successful resolver-identified public-recursive observation and synthetic A answer `192.0.2.1` with TTL 120.
- `readback/dns-ttl-audit.json` independently compares persisted record evidence with the rendered row's deadline and countdown; `readback/dns-ttl-cells.json` records both rendered timing cells.
- `domain-overview.png`, `domain-dns-parsed-ttl.png`, and `trace.zip` capture the real route and Parsed view. The only captured local-dev failures were the known `/_build/assets/client.css` 404 and blocked external font requests.
- Focused DNS collector tests passed: 5 files, 33 tests, with 6 opt-in live tests skipped because live DNS was disabled. No provider or production system was contacted.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-093035Z-f8254dc-final-domain/console.log | log | aux · unrecognized .log | bbac977684da3594c31d0cc785262f6a26d0d3c15b9fc69e37e10098aba4c8ec |
| verification/runs/20260901-093035Z-f8254dc-final-domain/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-093035Z-f8254dc-final-domain/domain-dns-parsed-ttl.png | png | evidence · 1280x755 | 2665e9a32fb5607b2303df554ce0e6db656ced41738f4eabaa458bcb60be2a93 |
| verification/runs/20260901-093035Z-f8254dc-final-domain/domain-harness.log | log | aux · unrecognized .log | 79ce504408eca6230e66740d361d7ff34b9d03174a42bdf646b84d71ee93f143 |
| verification/runs/20260901-093035Z-f8254dc-final-domain/domain-overview.png | png | evidence · 1280x1852 | a97e13c5aeed85ded1d08c7b7dcd85617bd3051b9c9a07bebc8df7f33dfd6ede |
| verification/runs/20260901-093035Z-f8254dc-final-domain/domain-surface-summary.json | json | aux · unrecognized .json | 3b6fba6c4037a4abea307fc0787bf35eb8334d0a75197c371402764aaecc9d4f |
| verification/runs/20260901-093035Z-f8254dc-final-domain/env.txt | env | aux | a2a4bfd7bea9cb84e9ac4f9689db9f14ef3076dcc763802a727d33f3d6df975b |
| verification/runs/20260901-093035Z-f8254dc-final-domain/failed-requests.log | log | aux · unrecognized .log | 0a6320a840bb683a57aac74725e6c979771d3a59b56179ac4d17a625b7b977a9 |
| verification/runs/20260901-093035Z-f8254dc-final-domain/focused-dns-collector.log | log | aux · unrecognized .log | 2009f87ef19acbd43784d5966549c90da3675272d8619419f4fa028d06467a8e |
| verification/runs/20260901-093035Z-f8254dc-final-domain/observations.md | md | aux · unrecognized .md | 6928acc4a357d7c5f06cc966c74ddf009a822c823358e1f0414756bc352bca51 |
| verification/runs/20260901-093035Z-f8254dc-final-domain/readback/dns-observations.json | readback | evidence | b341957bec64e950dbeb1ce8a33f7a1db4a22b8206cb81d311d1cdb43a091fa1 |
| verification/runs/20260901-093035Z-f8254dc-final-domain/readback/dns-ttl-audit.json | readback | evidence | 732ab3c59cb9b4a254f46e047ff28f46ff1a8df2d35ccb20d1a6ca08080d0de3 |
| verification/runs/20260901-093035Z-f8254dc-final-domain/readback/dns-ttl-cells.json | readback | evidence | c044ab8e5480dc206d6d4d296de0b421834cf7c377db4b8665e39e4097b63308 |
| verification/runs/20260901-093035Z-f8254dc-final-domain/trace.zip | trace | evidence · playwright trace | 26dd743125e555d3f40f39d847a83252d1620647302d2cee769231066ee67ee2 |
