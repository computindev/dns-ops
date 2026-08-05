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

### Provision the local Railway secret

An authorized operator can obtain the two values without copying them through a terminal or an artifact:

```sh
node tools/controlled-live-harness/railway-verification-secret-provisioner.mjs
```

The provisioner runs exactly two `railway domain status <pinned-domain-id> --project <pinned-project-id> --environment <pinned-environment-id> --service <pinned-service-id> --json` queries. It verifies the returned pinned domain ID/name and exact `_railway-verify` TXT record before atomically creating `$HOME/.config/dns-ops/railway-verification.env` at mode `0600`. It prints only a success status and file path, never a verification value. It does not call Cloudflare and has no Railway mutation command.

It refuses to replace an existing secret file (and performs no Railway query in that case). Use this only when intentionally refreshing both Railway values:

```sh
node tools/controlled-live-harness/railway-verification-secret-provisioner.mjs --replace
```

Do not redirect output, use shell tracing, commit the generated file, or run the provisioner without authorization to read the pinned Railway project. It is deliberately separate from the `web-*` commands, which may contact Cloudflare.

```sh
node tools/controlled-live-harness/runner.mjs web-preflight
node tools/controlled-live-harness/runner.mjs web-bootstrap /secure/operator/web-bootstrap.json
node tools/controlled-live-harness/runner.mjs web-verify
```

`web-preflight` and `web-verify` issue only GET requests and emit only operation/status summaries. `web-bootstrap` creates only missing exact records; an existing record must exactly match the approved name, type, content, and TTL. Its artifact contains target names, hashes, and redacted status summaries, never Railway TXT values.

## LIVE-01/02 fixture fault apply and restore

The harness alone may change the fixture mode for an authorized LIVE-01 or LIVE-02 run. The manifest pins the sole control endpoint, `https://asorin.ai/__dnsops/live-mode`, the `healthy` baseline, and the only two transitions:

- `LIVE-01` → `redirect_fault` for `www.asorin.ai`
- `LIVE-02` → `noindex_fault` for `asorin.ai`

Before either fixture command, the runner accepts only a mode-`0600` local file at `DNSOPS_FIXTURE_CONTROL_SECRET_FILE` (default: `$HOME/.config/dns-ops/fixture-control.env`) with exactly:

```sh
export DNSOPS_FIXTURE_CONTROL_TOKEN='local value omitted'
```

The token is read only after command arguments, recovery input, and the manifest allowlist pass validation. Fixture commands do not construct a Cloudflare adapter, read the Cloudflare credential, or call a provider API. Do not commit the token file or redirect command output.

```sh
node tools/controlled-live-harness/runner.mjs fixture-apply LIVE-01 /secure/operator/live-01-recovery.json
node tools/controlled-live-harness/runner.mjs fixture-restore /secure/operator/live-01-recovery.json /secure/operator/live-01-restored.json
```

`fixture-apply` requires a `healthy` authenticated GET readback before it POSTs the one manifest-approved fault mode, then requires a second authenticated GET readback of that fault mode. `fixture-restore` validates its redacted recovery artifact, requires the matching fault-mode readback, POSTs only `healthy`, and requires a final `healthy` readback. Both artifacts are written mode `0600` and contain only the pinned endpoint, mode/target identifiers, SHA-256 token fingerprint, timestamps, and HTTP operation/status summaries—never the token, bearer header, or response body. A failed readback aborts before the next transition.
