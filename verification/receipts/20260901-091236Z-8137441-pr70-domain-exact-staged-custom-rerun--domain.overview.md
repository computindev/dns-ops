---
receipt: verification-receipt/v0
run_id: 20260901-091236Z-8137441-pr70-domain-exact-staged-custom-rerun
feature_id: domain.overview
profile: changed
surface: web
sha: 8137441799fd5fc9492a774fb4f8293c28038f74
code_digest: 28f35e8afaf4110f8ff52143a2c8a68a6ca3da62001796a180c6ef5c7abfa003
dirty: true
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-independent-pr70-exact-staged-tree-domain"
evidence_dir: verification/runs/20260901-091236Z-8137441-pr70-domain-exact-staged-custom-rerun
created_at: 2026-09-01T09:15:14.247Z
---

# Receipt: domain.overview — passed

## Observations (expected → seen)

- A fresh verifier drove the real local home-page Analyze workflow to `/domain/google.com` with local e2e tenant headers, then opened the DNS tab. The isolated disposable PostgreSQL fixture supplied a synthetic `google.com` snapshot and one synthetic A answer (`192.0.2.1`) from reserved local-test resolver identity `192.0.2.53`; no provider, production, live DNS, or active probe was used.
- The Domain 360 heading contained `google.com`; Overview, DNS, Mail, History, and the currently enabled Delegation tabs were visible.
- The Parsed DNS table rendered one persisted `google.com` A row with non-empty Remaining TTL and Estimated live at cells. The live countdown and machine-readable `<time datetime>` matched the persisted recursive answer's `queriedAt + TTL` deadline.

## Forbidden (must not happen → confirmed absent)

- No blank TTL cells, averaged-TTL estimate, all-UNKNOWN output, CSS selector, coordinate click, fixed wait for an end state, provider call, or live DNS query was used.
- Browser navigation was restricted to the local web service; blocked external font requests were not used as evidence.

## Read-back (side effects checked through an independent path)

- `readback/dns-observations.json` records the API observation read-back, including the successful resolver-identified public-recursive observation and synthetic answer.
- `readback/dns-ttl-audit.json` independently compares persisted record evidence with every rendered row's deadline and countdown; `readback/dns-ttl-cells.json` records both rendered timing cells.
- `domain-overview.png`, `domain-dns-parsed-ttl.png`, and `trace.zip` capture the real UI route and Parsed view. `doctor.txt` records healthy local web and collector readiness. Captured dev-only failures were limited to `/_build/assets/client.css` 404 and blocked external fonts.
- The hydration-waited fresh Playwright drive used the feature's ARIA role/label selectors and retained evidence in this run directory.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-091236Z-8137441-pr70-domain-exact-staged-custom-rerun/console.log | log | aux · unrecognized .log | efaac86334d1d36e050ab4cec089a6f8f2a7a96e93713db5600503ac9c00de6a |
| verification/runs/20260901-091236Z-8137441-pr70-domain-exact-staged-custom-rerun/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-091236Z-8137441-pr70-domain-exact-staged-custom-rerun/domain-dns-parsed-ttl.png | png | evidence · 1280x755 | 67bca738c91202261a81b4456fd67f06a6e677bf8da7ae9e845078dc522253e5 |
| verification/runs/20260901-091236Z-8137441-pr70-domain-exact-staged-custom-rerun/domain-harness.log | log | aux · unrecognized .log | 8a5d327321ad897cf1dafa56f1e1352733c10f8fab88a8136eb871d235c7e5e1 |
| verification/runs/20260901-091236Z-8137441-pr70-domain-exact-staged-custom-rerun/domain-overview.png | png | evidence · 1280x1852 | 323da4fbce44eb7a54f0c56caf0ff56cfba2978965d86fa74e6ca0e34105000d |
| verification/runs/20260901-091236Z-8137441-pr70-domain-exact-staged-custom-rerun/domain-surface-summary.json | json | aux · unrecognized .json | d55afc5c3a0bc6a0582abcc2c9009463dd74812f4e6fdd7592f664230ab646e4 |
| verification/runs/20260901-091236Z-8137441-pr70-domain-exact-staged-custom-rerun/env.txt | env | aux | 97acae58b95b0b565ffb3cba3c4ac764d35f2b01da66cec12200c8c60c9e4f58 |
| verification/runs/20260901-091236Z-8137441-pr70-domain-exact-staged-custom-rerun/failed-requests.log | log | aux · unrecognized .log | 320dd31e56201312413a3a33a81f9e3a352356dcd75a6a02961a2976a68053e5 |
| verification/runs/20260901-091236Z-8137441-pr70-domain-exact-staged-custom-rerun/readback/dns-observations.json | readback | evidence | b341957bec64e950dbeb1ce8a33f7a1db4a22b8206cb81d311d1cdb43a091fa1 |
| verification/runs/20260901-091236Z-8137441-pr70-domain-exact-staged-custom-rerun/readback/dns-ttl-audit.json | readback | evidence | a03055fb17ba55133cc7d46e73d00b3cce9f00aa635085b0e36d475dc3b1a849 |
| verification/runs/20260901-091236Z-8137441-pr70-domain-exact-staged-custom-rerun/readback/dns-ttl-cells.json | readback | evidence | 60e48b6ba3f0d9564f8f624eba20a766ce1233833219549542eb690ef085fee3 |
| verification/runs/20260901-091236Z-8137441-pr70-domain-exact-staged-custom-rerun/trace.zip | trace | evidence · playwright trace | 40432776ffdc9ac7dc278c0cc14ee176d97138d8fea3f09ad4112e7970b5d025 |
