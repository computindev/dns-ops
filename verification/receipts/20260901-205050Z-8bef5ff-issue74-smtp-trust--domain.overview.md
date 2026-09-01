---
receipt: verification-receipt/v0
run_id: 20260901-205050Z-8bef5ff-issue74-smtp-trust
feature_id: domain.overview
profile: changed
surface: web
sha: 8bef5ffd60c368f1067c4b268bc05008fdbce754
code_digest: 7e4c614f91d010a4edee045cb11202801711fc8ce27c077299ef4ca1b0c28c89
dirty: true
untracked: 0
status: not_applicable
reason: "Type-only extension of SMTPProbeData JSONB interface in packages/db/src/schema/index.ts (issue #74); no runtime or SQL change to the Domain 360 web surface, which is the only behavior this feature maps. SMTP probe paths are deliberately unmapped (no controlled public SMTP fixture exists); proven instead by deterministic unit/e2e trust-matrix tests in apps/collector/src/probes/smtp-starttls*.test.ts."
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260901-205050Z-8bef5ff-issue74-smtp-trust
created_at: 2026-09-01T20:50:55.400Z
---

# Receipt: domain.overview — not_applicable

## Observations (expected → seen)

-

## Forbidden (must not happen → confirmed absent)

-

## Read-back (side effects checked through an independent path)

-

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-205050Z-8bef5ff-issue74-smtp-trust/env.txt | env | aux | 3f591b7d9a5a548335eb6ace9ed99027f62543bb76c92691031b2b1291c007b7 |
