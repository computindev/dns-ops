---
receipt: verification-receipt/v0
run_id: 20260903-233023Z-1f39ce5-issue56-paste-evidence
feature_id: health.public
profile: changed
surface: api
sha: 1f39ce5cc08dfce4c11b74ca640750cbde055742
code_digest: 4d5234ed773ce20af167c68f0cf39c5fc6e8663039277b9e3d89eaec7bc47c99
dirty: true
untracked: 1
status: blocked
reason: "Doctor verified web /api/health 200 healthy on this tree; the full health.public drive also requires collector /healthz and /readyz with matching revisions, and no collector instance is runnable in this lane (collector dev EMFILE crash). Diff only mounts the additive /api/paste route and does not touch health endpoints."
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260903-233023Z-1f39ce5-issue56-paste-evidence
created_at: 2026-09-03T23:33:42.330Z
---

# Receipt: health.public — blocked

## Observations (expected → seen)

- 

## Forbidden (must not happen → confirmed absent)

- 

## Read-back (side effects checked through an independent path)

- 

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-233023Z-1f39ce5-issue56-paste-evidence/console.log | log | aux · unrecognized .log | be09aaf459162736f5e29233517088611ceb7865dcb95911794292273a4d667e |
| verification/runs/20260903-233023Z-1f39ce5-issue56-paste-evidence/doctor.txt | txt | aux · unrecognized .txt | 291b74911bf6dfd21a1053e0e8228c479187272578439eb81b5a8d36a6fd7e6c |
| verification/runs/20260903-233023Z-1f39ce5-issue56-paste-evidence/env.txt | env | aux | 670150cef8d885640d68d06b15ab40b5170b7a26a46c2beffe1d1749b0f38d55 |
| verification/runs/20260903-233023Z-1f39ce5-issue56-paste-evidence/failed-requests.log | log | aux · unrecognized .log | 3d80c4859285aa8aac7ea6333f34c50528dc6f5c55a59b57c76ce4c342a42da6 |
| verification/runs/20260903-233023Z-1f39ce5-issue56-paste-evidence/http/01-web-health.json | http | evidence | 07f9e666d670899e77f76278e9302444a6c336ceb4d87a9f10b81fb803b5aabe |
| verification/runs/20260903-233023Z-1f39ce5-issue56-paste-evidence/observations.md | md | aux · unrecognized .md | 321a8c5e7ee14f97813f50ec65649e8887efff2e92f6a6e3c0ab7c9982a00541 |
| verification/runs/20260903-233023Z-1f39ce5-issue56-paste-evidence/trace.zip | trace | evidence · playwright trace | 84c117201f9b9545c607cca0bd0d8bf57d04303fa9d15d2949b778b103da8347 |
