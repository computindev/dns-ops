---
receipt: verification-receipt/v0
run_id: 20260903-182553Z-9fe885b-health-public-rebased-blocked
feature_id: health.public
profile: changed
surface: api
sha: 9fe885b38ae15dc7f65b39a52aadd56cc348431c
code_digest: eaa042f0feea806029e078abd252189cb01f2f839db5d476f6760cbf8a7a4e7e
dirty: false
untracked: 0
status: blocked
reason: "The exact rebased tree cannot complete the web health proof because no local PostgreSQL service is available for the required web healthy response; collector liveness was previously observed and this change only adds an early body-limit middleware before API routes."
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260903-182553Z-9fe885b-health-public-rebased-blocked
created_at: 2026-09-03T18:25:59.002Z
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
| verification/runs/20260903-182553Z-9fe885b-health-public-rebased-blocked/env.txt | env | aux | 81c988ea76efe27d88557144a8474a0f971c83bffe05966529506c7c48775a33 |
