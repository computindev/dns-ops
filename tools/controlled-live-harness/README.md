# Controlled live harness

This directory is the only repository component that may call Cloudflare for controlled live DNS work. Operators run it directly; DNS Ops application code and MCP never receive provider or fixture credentials.

## LIVE-01/02 Railway DNS bootstrap

The committed manifest pins the only permitted web records:

- `asorin.ai` CNAME → `epgybwo0.up.railway.app`
- `www.asorin.ai` CNAME → `4xbfxxr5.up.railway.app`
- `_railway-verify.asorin.ai` TXT
- `_railway-verify.www.asorin.ai` TXT

The two verification TXT values are deliberately absent from the manifest and all emitted artifacts. Before a `web-*` command, the runner requires a separate mode-`0600` file at `DNSOPS_RAILWAY_VERIFICATION_SECRET_FILE` (default: `$HOME/.config/dns-ops/railway-verification.env`) with exactly:

```sh
export RAILWAY_ASORIN_AI_VERIFICATION_TXT='runtime value omitted'
export RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT='runtime value omitted'
```

The literal example values above are placeholders for local operator documentation only; do not commit real values. The runner validates that file and both printable DNS TXT values before constructing a provider request. Every provider request revalidates the full manifest, zone, all exact CNAME/TXT tuples, credential fingerprint, and the runtime TXT values.

```sh
node tools/controlled-live-harness/runner.mjs web-preflight
node tools/controlled-live-harness/runner.mjs web-bootstrap /secure/operator/web-bootstrap.json
node tools/controlled-live-harness/runner.mjs web-verify
```

`web-preflight` and `web-verify` issue only GET requests and emit only operation/status summaries. `web-bootstrap` creates only missing exact records; an existing record must exactly match the approved name, type, content, and TTL. Its artifact contains target names, hashes, and redacted status summaries, never Railway TXT values.

LIVE-01/02 fixture mode changes are intentionally not exposed by this DNS bootstrap harness. They remain blocked by the fixture's separate `DNSOPS_FIXTURE_CONTROL_TOKEN` control boundary; an unsupported `fixture-mode` invocation fails before any runtime secret is read.
