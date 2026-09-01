---
receipt: verification-receipt/v0
run_id: 20260901-065231Z-fa5389b-domain-overview-blocked
feature_id: domain.overview
profile: changed
surface: web
sha: fa5389b4a0b9e2ef0ab3b2842d7a26998d9c6588
code_digest: f542e06d54c8b9b56e14478c8839bf0787568e74095260e3bfc9a305c94148da
dirty: false
untracked: 0
status: blocked
reason: "Changed-profile live Domain 360 proof is blocked: the safe local fixture database has no google.com domain row and zero resolver-identified successful public-recursive observations, so the required persisted recursive TTL evidence is unavailable. No passed receipt is claimable."
verifier: fresh
verifier_session: "fresh-independent-fa5389b-exact-staged-tree-domain-preflight"
evidence_dir: verification/runs/20260901-065231Z-fa5389b-domain-overview-blocked
created_at: 2026-09-01T06:56:18.386Z
---

# Receipt: domain.overview — blocked

## Observations (expected → seen)

- Domain 360 changed-profile proof requires a persisted snapshot for the documented domain with a successful, resolver-identified `public-recursive` observation and usable TTL evidence.
- The safe local fixture database was read-only checked through `domain-preflight.txt`: it has no `google.com` domain row and zero resolver-identified successful public-recursive observations; its six rows are the fleet-report fixture domains.

## Forbidden (must not happen → confirmed absent)

- No provider, production, active-probe, credential, tracker, or external live-service path was used.
- No passed Domain 360 receipt was claimed from mocked TTL fixtures without persisted recursive evidence.

## Read-back (side effects checked through an independent path)

- `domain-preflight.txt` records direct PostgreSQL read-back against the disposable local fixture database. The required persisted recursive TTL precondition is unavailable, so this changed-profile receipt remains honestly blocked.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-065231Z-fa5389b-domain-overview-blocked/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-065231Z-fa5389b-domain-overview-blocked/domain-preflight.txt | txt | aux · unrecognized .txt | 2ded95aa2a04e5ec5820ada7e361addb63840553a21c0cb52c88d3da3d76d2b2 |
| verification/runs/20260901-065231Z-fa5389b-domain-overview-blocked/domain-ttl-e2e.log | log | aux · unrecognized .log | f26c9cdeb51d53a37f4e18c61eaa9d41b1be5645d8cf11cee8e50ffea4173101 |
| verification/runs/20260901-065231Z-fa5389b-domain-overview-blocked/env.txt | env | aux | 7356c6fc7e22073b37afd87ac37463826367310b52cad087ac1d389853beda9b |
| verification/runs/20260901-065231Z-fa5389b-domain-overview-blocked/observations.md | md | aux · unrecognized .md | b8755e3f4dde17b712f741be9cb9846fe890689ba0438ef868856f33d3650864 |
| verification/runs/20260901-065231Z-fa5389b-domain-overview-blocked/route-timestamp-tests.log | log | aux · unrecognized .log | 39d4a3585c4008bb9c85903d4ff2277b4a936209a589173e21508f8c39c840bb |
| verification/runs/20260901-065231Z-fa5389b-domain-overview-blocked/verify-kit-tests.log | log | aux · unrecognized .log | 4d31007d25d9be734feda8103c5748de1df80c0083df2fd13d6c7345d01c7b27 |
