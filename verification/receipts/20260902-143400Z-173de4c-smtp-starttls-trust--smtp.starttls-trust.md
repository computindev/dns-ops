---
receipt: verification-receipt/v0
run_id: 20260902-143400Z-173de4c-smtp-starttls-trust
feature_id: smtp.starttls-trust
profile: critical
surface: api
sha: 173de4c62f485550cc143a95be30408bf43ff3b3
code_digest: 0f13a8092a42e9ecc969bb1c81e4bd16be4962829f3eac538d7bbf5cab0886d5
dirty: true
untracked: 2
status: passed
reason: ""
verifier: builder
verifier_session: "harness:smtp-starttls-trust"
evidence_dir: verification/runs/20260902-143400Z-173de4c-smtp-starttls-trust
created_at: 2026-09-02T14:35:04.761Z
---

# Receipt: smtp.starttls-trust — passed

## Observations (expected → seen)

- The deterministic SMTP fixture passed with negotiated TLS, `success:true`, `tlsTrusted:true`, and certificate chain/hostname authorization both true; the fixture command transcript contained only EHLO/STARTTLS/QUIT and no credential or message commands.
- Expired, hostname-mismatch, and untrusted-chain fixtures passed with `success:false`, negotiated evidence retained, trust false, authorization diagnostics preserved, and no QUIT on untrusted sessions. String `DEPTH_ZERO_SELF_SIGNED_CERT` and `Error` certificate messages were both preserved.
- Repository and persistence fixtures passed for forged/legacy rows and contradictory timeout status; trusted and non-SMTP controls remained successful. SSRF, checked-IP pinning, cumulative DNS/connect/banner/EHLO/STARTTLS/TLS deadlines, and socket cleanup all passed. The collector route authorization suite passed persisted-evidence, no-credential, stale, tenant, host, and port-denial cases.

## Forbidden (must not happen → confirmed absent)

- No provider connection or credential was used. No AUTH, MAIL FROM, RCPT TO, or DATA command was emitted. Blocked addresses never created sockets, checked addresses were pinned, and untrusted or contradictory rows never counted as successful.

## Read-back (side effects checked through an independent path)

- The built-artifact proof independently read ProbeObservationRepository by id, snapshot/type, hostname, failed, slow, time-range, status counts, and summary, and exercised the persistence mapper; adapter rows remained unchanged. Route tests independently checked response JSON, persisted-evidence adapter state, probe invocation count, and tenant allowlist state.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260902-143400Z-173de4c-smtp-starttls-trust/cli-built-repository-proof.txt | transcript | evidence | 5458d042eca017afce0481ca226933c9b619aacde5cdc3f985e8c44de19f68d3 |
| verification/runs/20260902-143400Z-173de4c-smtp-starttls-trust/cli-collector-trust-tests.txt | transcript | evidence | e5b8cbf9857f646db65ceaea15adde67431bc8c44f682c8eb775c118a948f80e |
| verification/runs/20260902-143400Z-173de4c-smtp-starttls-trust/env.txt | env | aux | 76713a88f6ecac7bb49a121c68910a56fa3c233546c0a2853fef7bb6988d4289 |
| verification/runs/20260902-143400Z-173de4c-smtp-starttls-trust/observations.md | md | aux · unrecognized .md | 46b6134e5b8f103316e55aa876c167041c0bc1242e7fea4ab7d27c2c8872966a |
| verification/runs/20260902-143400Z-173de4c-smtp-starttls-trust/readback/verification-boundaries.json | readback | evidence | 49c2c77d3281a6068044ada6ec5b970c64fe78f3cda960112e7510212a798829 |
