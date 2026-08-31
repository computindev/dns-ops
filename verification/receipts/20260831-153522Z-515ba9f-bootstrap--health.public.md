---
receipt: verification-receipt/v0
run_id: 20260831-153522Z-515ba9f-bootstrap
feature_id: health.public
profile: changed
surface: api
sha: 515ba9f37c10d33779f514213e5b8f7cefb0add3
code_digest: 8876a60b69ca39345949cc19ebef62371ff3a5dccfa85d01a08c0f28670cc1bc
dirty: true
untracked: 0
status: blocked
reason: "no local .env, node_modules, or Postgres on :5432; doctor web /api/health FAIL"
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260831-153522Z-515ba9f-bootstrap
created_at: 2026-08-31T15:35:22.186Z
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
| verification/runs/20260831-153522Z-515ba9f-bootstrap/env.txt | env | aux | 5e22194079902920fece5b29866a07502d695d7a28d54ff627f1a1be2e8c019a |
