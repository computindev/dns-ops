---
receipt: verification-receipt/v0
run_id: 20260902-143549Z-d6a4195-smtp-starttls-trust-final
feature_id: smtp.starttls-trust
profile: critical
surface: api
sha: d6a41951584cc2f19796d76e9d5ddd0571585e60
code_digest: 0f13a8092a42e9ecc969bb1c81e4bd16be4962829f3eac538d7bbf5cab0886d5
dirty: true
untracked: 0
status: passed
reason: ""
verifier: builder
verifier_session: "harness:smtp-starttls-trust-final"
evidence_dir: verification/runs/20260902-143549Z-d6a4195-smtp-starttls-trust-final
created_at: 2026-09-02T14:37:41.054Z
---

# Receipt: smtp.starttls-trust — passed

## Observations (expected → seen)

- The deterministic SMTP fixture passed with negotiated TLS, `success:true`, `tlsTrusted:true`, and certificate chain/hostname authorization both true; its command transcript contained only EHLO/STARTTLS/QUIT and no credential or message commands.
- Expired, hostname-mismatch, and untrusted-chain fixtures passed with `success:false`, negotiated evidence retained, trust false, authorization diagnostics preserved, and no QUIT on untrusted sessions. String `DEPTH_ZERO_SELF_SIGNED_CERT` and `Error` certificate messages were both preserved.
- Repository and persistence fixtures passed for forged/legacy rows and contradictory timeout status; trusted and non-SMTP controls remained successful. SSRF, checked-IP pinning, cumulative DNS/connect/banner/EHLO/STARTTLS/TLS deadlines, and socket cleanup all passed. The collector route authorization suite passed persisted-evidence, no-credential, stale, tenant, host, and port-denial cases.

## Forbidden (must not happen → confirmed absent)

- No provider connection or credential was used. No AUTH, MAIL FROM, RCPT TO, or DATA command was emitted. Blocked addresses never created sockets, checked addresses were pinned, and untrusted or contradictory rows never counted as successful.

## Read-back (side effects checked through an independent path)

- The built-artifact proof independently read ProbeObservationRepository by id, snapshot/type, hostname, failed, slow, time-range, status counts, and summary, and exercised the persistence mapper; adapter rows remained unchanged. Route tests independently checked response JSON, persisted-evidence adapter state, probe invocation count, and tenant allowlist state.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260902-143549Z-d6a4195-smtp-starttls-trust-final/cli-built-repository-proof.txt | transcript | evidence | a019aa3c954c412b75e520c7007e9e9057dfb14f7229baa3dc5de2a7240aa203 |
| verification/runs/20260902-143549Z-d6a4195-smtp-starttls-trust-final/cli-collector-trust-tests.txt | transcript | evidence | 19e7b98aba0ad4f07d96cf858d6c3aaf866962dab46d351bc08340e859308481 |
| verification/runs/20260902-143549Z-d6a4195-smtp-starttls-trust-final/env.txt | env | aux | 4273c558d0120683f0aabd33ee01610afd410297caecfccaf4bc4ea1d0d81fea |
| verification/runs/20260902-143549Z-d6a4195-smtp-starttls-trust-final/observations.md | md | aux · unrecognized .md | 30293e6a6df37aad1065d40f17eb51b5994819f545f352d037af60e57a24f88e |
| verification/runs/20260902-143549Z-d6a4195-smtp-starttls-trust-final/readback/verification-boundaries.json | readback | evidence | 49c2c77d3281a6068044ada6ec5b970c64fe78f3cda960112e7510212a798829 |
