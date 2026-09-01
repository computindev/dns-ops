---
receipt: verification-receipt/v0
run_id: 20260901-075724Z-4063b7c-pr70-domain-overview-fresh-blocked
feature_id: domain.overview
profile: changed
surface: web
sha: 4063b7c14c185be971f274032a3412797c0fe38c
code_digest: 6eabeb229cbd6284fd634486bdd49d9595208ce4d27f81546751908d4a341433
dirty: true
untracked: 0
status: blocked
reason: "Changed-profile Domain 360 proof is blocked: the disposable local fixture has no google.com domain row and zero successful identifier-bearing public-recursive observations, so the required persisted recursive TTL evidence is unavailable; no passed receipt is claimable."
verifier: fresh
verifier_session: "fresh-independent-pr70-domain-overview-preflight"
evidence_dir: verification/runs/20260901-075724Z-4063b7c-pr70-domain-overview-fresh-blocked
created_at: 2026-09-01T08:05:30.837Z
---

# Receipt: domain.overview — blocked

## Observations (expected → seen)

- The fresh verifier reached the real Domain 360 route for `google.com` through the local authenticated/e2e-header path and captured the Domain 360 shell, tabs, and heading.
- The changed-profile proof requires persisted recursive DNS evidence for the documented domain. The disposable fixture contained six fleet domains, no `google.com` domain row, and zero successful identifier-bearing `public-recursive` observations.
- The DNS Parsed view therefore could not produce the required persisted-evidence TTL rows; the harness stopped when `Remaining TTL` was unavailable. This receipt is honestly blocked, not a pass.

## Forbidden (must not happen → confirmed absent)

- No provider, production, credential, active-probe, tracker-write, or external live-service path was used.
- No passed Domain Overview receipt was claimed from mocked or absent recursive TTL evidence.
- No product or test files were edited to bypass the missing fixture precondition.

## Read-back (side effects checked through an independent path)

- `readback/domain-preflight.json` records direct read-back of the disposable database: `matchingDomainRows: 0`, `successfulPublicRecursiveObservations: 0`, and six fixture rows under the public-recursive vantage.
- `domain-harness.log`, `domain-overview.png`, and `trace.zip` capture the route and the precise TTL-column timeout. The local CSS 404, blocked external fonts, and missing fixture-backed API rows are retained as evidence.
- Safe focused tests and static checks were run separately; they do not establish the required persisted recursive fixture evidence for this changed-profile surface.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-075724Z-4063b7c-pr70-domain-overview-fresh-blocked/console.log | log | aux · unrecognized .log | d584b608feccd44bc73684635535994b5a48dcbdefa6f21dcc5bb3271b538471 |
| verification/runs/20260901-075724Z-4063b7c-pr70-domain-overview-fresh-blocked/domain-harness.log | log | aux · unrecognized .log | f0deacbdffd285aae4765fd65eee06caf13086217c34fa3348fb780cdb5c331c |
| verification/runs/20260901-075724Z-4063b7c-pr70-domain-overview-fresh-blocked/domain-overview.png | png | evidence · 1280x720 | 10374606b0f7c63e9cbb64695cedd291c6a01748719452621695e9d04720bb78 |
| verification/runs/20260901-075724Z-4063b7c-pr70-domain-overview-fresh-blocked/env.txt | env | aux | 84f4778fef670cb22961c5bc3c918ef32897ab74c81b14d7fefc6ca19e1d74f1 |
| verification/runs/20260901-075724Z-4063b7c-pr70-domain-overview-fresh-blocked/failed-requests.log | log | aux · unrecognized .log | 47ec4c7df6d68ed51977bccb7b1958bd4e5ee9bccee4f09ac7f2168d79860437 |
| verification/runs/20260901-075724Z-4063b7c-pr70-domain-overview-fresh-blocked/readback/domain-preflight.json | readback | evidence | cfd5dbe7961be4158c254546960630e722cd2d59d5ece475e2a57b9e76d79633 |
| verification/runs/20260901-075724Z-4063b7c-pr70-domain-overview-fresh-blocked/trace.zip | trace | evidence · playwright trace | 3a30ca4d64896c82b56641b27846595039ee88278fb24bd6d6c58e8bc1c42a7b |
