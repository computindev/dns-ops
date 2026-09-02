---
id: smtp.starttls-trust
surface: api
profile: critical
paths:
  - apps/collector/src/probes/**
  - apps/collector/src/jobs/probe-routes.ts
  - packages/db/src/repos/probe-observation.ts
always_with: []
---
# SMTP STARTTLS trust diagnostics

The collector's programmatic SMTP STARTTLS probe checks that a server advertises STARTTLS and completes TLS whose certificate chain and hostname are both authorized. It keeps invalid-certificate diagnostics for operators, but never reports an untrusted or contradictory result as trusted SMTP. This is a read-only capability: the probe sends no credentials or mail and the verification drive never contacts a provider.

## Sub-features

- Trusted STARTTLS negotiation with a pinned, checked address.
- Expired, hostname-mismatch, and untrusted-chain certificates retained as diagnostic evidence.
- String- and `Error`-valued authorization diagnostics preserved by SMTP and TLS certificate collectors.
- Persisted SMTP rows fail closed for forged, legacy, and contradictory status/trust fields while retaining raw diagnostics.
- SSRF, no-credential, socket-pinning, cumulative-deadline, and cleanup invariants.

## How to get to it (user POV)

1. Use the collector's authenticated SMTP STARTTLS API operation for a persisted, fresh MX target.
2. Read the returned probe result, then read the persisted observation through the collector/web observation read path.
3. For this no-provider verification run, the same production API handler and repository are driven in-process with a deterministic persisted-evidence adapter; DNS, TCP, and TLS are replaced only at their existing external-system boundaries.

The public operation is `POST /api/probe/smtp-starttls` with `{ "domain": "<registered-domain>", "hostname": "<persisted-mx-target>" }`. The route authorizes only fresh, tenant-owned persisted MX evidence and only port 25.

## Driving it with harness/smtp-starttls-trust.mts

```bash
VERIFY_RUN_DIR=<run dir> bun .agents/skills/verify-dns-ops/harness/smtp-starttls-trust.mts
```

The helper runs the built-artifact repository proof, the real collector route authorization tests, and deterministic SMTP/TLS boundary fixtures. It writes each command transcript under `$VERIFY_RUN_DIR/` and leaves no provider state behind.

## Proof

### Expected observations

- The valid fixture returns `success: true`, `supportsStarttls: true`, `tlsNegotiated: true`, `tlsTrusted: true`, and certificate `chainAuthorized: true` plus `hostnameAuthorized: true`.
- The valid fixture's command transcript contains only `EHLO`, `STARTTLS`, and `QUIT`; it contains no `AUTH`, `MAIL FROM`, `RCPT TO`, or `DATA` command.
- Expired, hostname-mismatch, and untrusted-chain fixtures return `success: false` with negotiated TLS evidence, `tlsTrusted: false`, both certificate diagnostics and their authorization error text retained, and no `QUIT` sent over an untrusted session.
- SMTP and TLS certificate fixtures preserve both a string authorization error (for example `DEPTH_ZERO_SELF_SIGNED_CERT`) and an `Error` message.
- Repository read methods expose forged and legacy SMTP rows as unsuccessful, and a row with complete trust fields but `status: timeout` remains unsuccessful with its timeout status and error text unchanged. Trusted SMTP and non-SMTP controls remain successful.
- The SSRF fixtures reject loopback, private, special-purpose, and IPv6 answers before a socket is created; the public-address fixture connects to the checked IP rather than the hostname; DNS, connect, banner, EHLO, STARTTLS, and TLS stalls return the configured cumulative deadline and destroy active sockets.
- The route rejects missing credentials/identity, caller-supplied DNS evidence, stale or missing persisted evidence, non-persisted hostnames, and non-25 ports without invoking a probe. The route's batch summary counts only trusted TLS as successful.

### Forbidden observations

- A certificate with an expired chain, an untrusted chain, or a hostname mismatch becomes a successful SMTP result.
- A forged/legacy persisted row or a contradictory failure status appears in `findSuccessfulSmtpProbes`, a success count, or a successful summary.
- Any SMTP credential or message command is sent, any checked public IP is replaced by a hostname reconnect, or any blocked address reaches a socket.
- The harness contacts a provider, writes a DNS/mail/provider record, uses a credential, or relies on fixed sleeps, test/debug HTTP endpoints, CSS selectors, or coordinates.

### Read-back

- `verification/builder/issue74-smtp-fail-closed.proof.mjs` reads built `@dns-ops/db` and collector artifacts through `ProbeObservationRepository`, checking `findById`, snapshot/type/hostname/time-range/failed/slow queries, status counts, summaries, and the persistence mapper without mutating adapter rows.
- The collector route authorization test reads the response body and independently checks the persisted-evidence adapter, invoked-probe call count, and tenant allowlist state.
- The deterministic SMTP/TLS fixtures read socket command transcripts, checked connect targets, TLS options, certificate verdicts, and destroyed/ended socket state from the production probe boundary.

## Gotchas

- Active probes are disabled by default and the deployed collector must not be used for this proof. The helper is the safe local path because every outbound system boundary is deterministic and no credentials are accepted.
- The collector API requires fresh persisted DNS evidence and service authentication; no route may be authorized from caller-supplied MX/TXT arrays.
- `critical` needs a separate fresh verifier receipt at the exact final commit. Builder evidence and a builder receipt are provisional only.
