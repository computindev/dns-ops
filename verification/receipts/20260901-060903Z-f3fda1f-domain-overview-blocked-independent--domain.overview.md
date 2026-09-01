---
receipt: verification-receipt/v0
run_id: 20260901-060903Z-f3fda1f-domain-overview-blocked-independent
feature_id: domain.overview
profile: changed
surface: web
sha: f3fda1f54f39cecb1637eca4d76e60603aaedb55
code_digest: 682cd9831ae1d58fda95e4036a6490902dd817107c9028c20bbb3485942feea2
dirty: true
untracked: 2
status: blocked
reason: "Changed-profile live Domain 360 proof is blocked: the safe local fixture database has no google.com domain row and zero resolver-identified successful public-recursive observations, so the required persisted recursive TTL evidence is unavailable. No passed receipt is claimable."
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260901-060903Z-f3fda1f-domain-overview-blocked-independent
created_at: 2026-09-01T06:09:27.506Z
---

# Receipt: domain.overview — blocked

## Observations (expected → seen)

- Domain 360 changed-profile proof requires a persisted snapshot for the documented domain with a successful, resolver-identified `public-recursive` observation and usable TTL evidence → the safe local fixture database contains six fleet-report domains, no `google.com` row, and zero resolver-identified public-recursive observations.

## Forbidden (must not happen → confirmed absent)

- No passed Domain 360 receipt was claimed from mocked TTL fixtures without persisted recursive evidence → the receipt is explicitly blocked.
- No provider, production, active-probe, credential, tracker-write, or external live path was used → the read-back was a direct read-only query against local fixture Postgres at 127.0.0.1:55441.

## Read-back (side effects checked through an independent path)

- `domain-preflight.txt` → direct PostgreSQL read-back reports `google_domains=0`, `resolver_identified_recursive_observations=0`, and `fixture_domains=6`; the required persisted recursive TTL precondition is unavailable, so Domain 360 remains blocked per the feature Gotchas.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-060903Z-f3fda1f-domain-overview-blocked-independent/domain-preflight.txt | txt | aux · unrecognized .txt | 2ded95aa2a04e5ec5820ada7e361addb63840553a21c0cb52c88d3da3d76d2b2 |
| verification/runs/20260901-060903Z-f3fda1f-domain-overview-blocked-independent/env.txt | env | aux | b547d0312dbccab00939dbd91c03d6a8001a230a2178218ffc3655980e1e4f57 |
| verification/runs/20260901-060903Z-f3fda1f-domain-overview-blocked-independent/observations.md | md | aux · unrecognized .md | 56341e7d231a6d6da8352c8f20896268423babebbdd0df65df1e1e57033e4270 |
