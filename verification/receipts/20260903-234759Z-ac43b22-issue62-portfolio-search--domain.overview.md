---
receipt: verification-receipt/v0
run_id: 20260903-234759Z-ac43b22-issue62-portfolio-search
feature_id: domain.overview
profile: changed
surface: web
sha: 1f39ce5cc08dfce4c11b74ca640750cbde055742
code_digest: 7de3be972652e1cbb2dd7db97a82735958b14daca1e786fdc22432f003cf5646
dirty: true
untracked: 0
status: blocked
reason: "Domain 360 was not driven in this run; the only mapped-path change is the additive drill_runs table and audit enum values in packages/db/src/schema/index.ts, which do not alter Domain 360 behavior. Verified instead: drills route tests (19 passing), schema migration applied cleanly on Postgres, verify-migrations parity green, and a live portfolio.search drive at this tree."
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search
created_at: 2026-09-03T23:51:07.724Z
---

# Receipt: domain.overview — blocked

## Observations (expected → seen)

- 

## Forbidden (must not happen → confirmed absent)

- 

## Read-back (side effects checked through an independent path)

- 

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/console.log | log | aux · unrecognized .log | fb1c5280b2ded51c27990451770a18fece409e5a72096e5e6bbf6df0e68a84d0 |
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/failed-requests.log | log | aux · unrecognized .log | f6402713f7645cc2822734ae80ff55f3e237097309b38674aad3e11e501ffb0a |
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/observations.md | md | aux · unrecognized .md | 90753d8d899ba27cb29a3fd66607c8c869920522d8c6681311b08bb8cc6b3566 |
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/portfolio-search.png | png | evidence · 1280x5587 | 08c43762553de90390a6484068c49566202c6f3330b1dae7f75cfede4c805778 |
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/readback/built-in-view-requests.json | readback | evidence | f9f1bf24c3395369ef8a06f51b03c9a1d9b795827f0cecec78ef3d1db3145458 |
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/readback/portfolio-search.json | readback | evidence | d4a7d88aa0fb1ab92fbba699262bca53c72c473a7a8cd1434f3f2268acadd0fb |
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/trace.zip | trace | evidence · playwright trace | 6371bf15539509ed4a9ebcbff7c445eef15d19a9081e2ae3a6d106597c3dcf09 |
| verification/runs/20260903-234759Z-ac43b22-issue62-portfolio-search/video/eb84b68ea3e333ae2d5a6119d0ad48cf.webm | video | evidence | e9fa31096d64e6b4f45e719b9e012117fe27f3b9d2851f1d75f3fe54a98c0848 |
