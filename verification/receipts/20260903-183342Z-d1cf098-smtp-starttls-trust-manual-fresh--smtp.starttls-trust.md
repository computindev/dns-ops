---
receipt: verification-receipt/v0
run_id: 20260903-183342Z-d1cf098-smtp-starttls-trust-manual-fresh
feature_id: smtp.starttls-trust
profile: critical
surface: api
sha: c6f9768c1cb6424a743808c406eabf7e281dc3b8
code_digest: eaa042f0feea806029e078abd252189cb01f2f839db5d476f6760cbf8a7a4e7e
dirty: false
untracked: 1
status: passed
reason: ""
verifier: fresh
verifier_session: ""
evidence_dir: verification/runs/20260903-183342Z-d1cf098-smtp-starttls-trust-manual-fresh
created_at: 2026-09-03T20:14:22.036Z
---

# Receipt: smtp.starttls-trust — passed

## Observations (expected → seen)
- Deterministic SMTP/TLS trust harness completed with exit code 0.
- Collector trust tests and built repository proof both completed with exit code 0.
- Read-back covered ProbeObservationRepository queries, collector route authorization, persisted-evidence adapter state, and deterministic socket/TLS boundaries.

## Forbidden (expected absent → confirmed absent)
- `verification-boundaries.json` records activeProbesAgainstProviders=false and credentialsProvided=false.
- No provider writes or credentials were used.

## Read-back
- `readback/verification-boundaries.json` contains the command exit codes, no-provider assertion, and independent repository/route read-back paths.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-183342Z-d1cf098-smtp-starttls-trust-manual-fresh/cli-built-repository-proof.txt | transcript | evidence | c0809e40fc36a7c781740b034c7731c593d3d944cd52b2aa12a358375778349f |
| verification/runs/20260903-183342Z-d1cf098-smtp-starttls-trust-manual-fresh/cli-collector-trust-tests.txt | transcript | evidence | 615509805efb61e06fe8ac06362ed8087ada30593b29cca0d29972930120d128 |
| verification/runs/20260903-183342Z-d1cf098-smtp-starttls-trust-manual-fresh/env.txt | env | aux | c2d2adbc8593cb05b94f09c149ec1365ebce56da3f638bea4444437a3fc51dc7 |
| verification/runs/20260903-183342Z-d1cf098-smtp-starttls-trust-manual-fresh/observations.md | md | aux · unrecognized .md | 7db9f62b82ba2d38ee40b4db344899bb8b512eefa6f25af0eb0b1586404daf30 |
| verification/runs/20260903-183342Z-d1cf098-smtp-starttls-trust-manual-fresh/readback/verification-boundaries.json | readback | evidence | 49c2c77d3281a6068044ada6ec5b970c64fe78f3cda960112e7510212a798829 |
