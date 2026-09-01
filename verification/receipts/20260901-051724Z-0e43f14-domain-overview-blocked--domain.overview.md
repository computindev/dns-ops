---
receipt: verification-receipt/v0
run_id: 20260901-051724Z-0e43f14-domain-overview-blocked
feature_id: domain.overview
profile: changed
surface: web
sha: 0e43f146eb57b805370370d45ece0705f28d2a9e
code_digest: f1eba15392d05f8fac237aa00a149ad60112a2b516aaf3d8b9b919f3ff5ccdc0
dirty: true
untracked: 2
status: blocked
reason: "Changed-profile live proof is blocked: the safe local fixture database has no google.com domain row and zero resolver-identified successful public-recursive observations, so the required persisted recursive TTL evidence is unavailable. No passed receipt is claimable."
verifier: fresh
verifier_session: "fresh-pr71-0e43f146-domain-preflight"
evidence_dir: verification/runs/20260901-051724Z-0e43f14-domain-overview-blocked
created_at: 2026-09-01T05:18:03.464Z
---

# Receipt: domain.overview — blocked

## Observations (expected → seen)

- The changed-profile Domain 360 proof requires a persisted snapshot for `google.com` with a successful, resolver-identified `public-recursive` observation and usable live TTL evidence.
- The safe local fixture database was read-only checked: it contains the six fleet-report fixture domains, no `google.com` domain row, and zero resolver-identified public-recursive observations.

## Forbidden (must not happen → confirmed absent)

- No provider, production, active-probe, credential, tracker, or live external service path was used.
- No passed Domain 360 receipt was fabricated from unit/E2E fixtures without persisted recursive evidence.

## Read-back (side effects checked through an independent path)

- `domain-preflight.txt` records the direct local PostgreSQL read-back used to establish the missing proof precondition. Per the changed-profile proof definition and its Gotchas, Domain 360 remains explicitly blocked, not passed.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-051724Z-0e43f14-domain-overview-blocked/domain-preflight.txt | txt | aux · unrecognized .txt | 2ded95aa2a04e5ec5820ada7e361addb63840553a21c0cb52c88d3da3d76d2b2 |
| verification/runs/20260901-051724Z-0e43f14-domain-overview-blocked/env.txt | env | aux | 16b85a0c509678d92298e54852f87cce87dce24d4f1f6ae408399bebb6bbcaaf |
| verification/runs/20260901-051724Z-0e43f14-domain-overview-blocked/observations.md | md | aux · unrecognized .md | 58362e54e3cf1d88d653b9b5775e85c53225a3f0fe3104ebf664ede2addfd4a1 |
