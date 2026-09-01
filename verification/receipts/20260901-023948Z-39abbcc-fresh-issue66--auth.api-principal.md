---
receipt: verification-receipt/v0
run_id: 20260901-023948Z-39abbcc-fresh-issue66
feature_id: auth.api-principal
profile: critical
surface: api
sha: 39abbcc36aab51c3628a76f62a2ab22938f916ba
code_digest: d8d15a8c15358ed3c0c9bcf794aca8774dd42fec165e2e33cc9d5054c20145f0
dirty: true
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "local-web:3002+collector:3011:isolated-postgres"
evidence_dir: verification/runs/20260901-023948Z-39abbcc-fresh-issue66
created_at: 2026-09-01T02:49:13.836Z
---

# Receipt: auth.api-principal — passed

# auth.api-principal — fresh verification observations

Independent verifier session at exact committed `HEAD 39abbcc36aab51c3628a76f62a2ab22938f916ba`.
No product files were changed. The local run used an isolated disposable PostgreSQL 16 container,
web on `127.0.0.1:3002` (port 3000 was occupied by another checkout), and collector on
`127.0.0.1:3011` from freshly built `apps/collector/dist`. Active probes were disabled; no
production service, provider, live OAuth, or real credential was contacted.

## Focused test suites (all exit 0)

- `bunx vitest run packages/contracts/src/api-principal.test.ts` — 1 file, 21 tests passed.
- `bunx vitest run apps/web/hono/middleware/auth.test.ts` — 1 file, 40 tests passed.
- `bunx vitest run apps/collector/src/middleware/auth.test.ts` — 1 file, 12 tests passed.
- `bunx vitest run apps/web/hono/routes/findings.runtime.test.ts` — 1 file, 30 tests passed.
- `bunx vitest run apps/collector/src/jobs/shared-reports.test.ts apps/collector/src/jobs/probe-routes.test.ts apps/collector/src/jobs/monitoring.integration.test.ts` — 3 files, 62 tests passed.
- `bunx vitest run apps/web/hono/config/env.test.ts apps/collector/src/config/env.test.ts` — 2 files, 46 tests passed.
- `bunx vitest run apps/web/hono/routes/auth-e2e.test.ts` — 1 file, 11 tests passed.

## Local runtime drive (redacted HTTP exchanges in `http/`)

- `doctor.sh` with `APP_URL=http://127.0.0.1:3002` and `COLLECTOR_URL=http://127.0.0.1:3011` — exit 0, 5 checks ok, 0 failed.
- Web valid bare token plus forged `X-Tenant-Id`/`X-Actor-Id` → `GET /api/auth/me` returned 200; response tenant was the configured principal UUID and email was `fresh-verifier-66@dns-ops.local`, not forged identity (`W1`).
- Web unknown token, disabled principal token, correctly-secreted forged legacy credential with legacy flag false, and no credential → 401 (`W2`–`W5`).
- Web `GET /api/findings/backfill/status` with valid principal token plus forged actor header → 200 (`W6`); the route produced a ruleset version.
- Independent PostgreSQL read-back of `ruleset_versions.created_by` observed `fresh-verifier-66`, expected `fresh-verifier-66`, forbidden `forged-actor`; assertion true (`readback/ruleset-created-by.json`).
- Collector freshly built output valid bare token plus forged tenant/actor headers → `GET /api/probe/health` returned 200 healthy (`C1`), proving authenticated route access without egress.
- Collector unknown token, disabled principal token, correctly-secreted forged legacy credential with legacy flag false, and no credential → 401 (`C2`–`C5`).

## Build and safety

- `bun run --filter @dns-ops/collector build` — exit 0; generated auth output contained `parseApiPrincipals`.
- Collector generated `dist` was used for the runtime drive and then restored to the exact `HEAD` tree before artifact staging; `git diff -- apps/collector/dist` was empty.
- Runtime migration applied only to the disposable local database; container and started services were stopped and removed after the drive.
- All credential-bearing request values and local database credentials were redacted from evidence; only placeholders appear in HTTP artifacts.

## Forbidden (must not happen → confirmed absent)

- Request-supplied tenant/actor headers did not override principal identity.
- Forged legacy, unknown, disabled, and missing credentials did not authenticate.
- No raw token, password, production/provider credential, or production endpoint appears in the evidence artifacts.
- No active probe or provider/DNS egress was invoked.
- No tracked collector `dist` changes remain after runtime proof.

## Read-back (side effects checked through an independent path)

- `http/W1-web-valid-spoof.json` and `http/C1-collector-valid-spoof.json` capture successful authenticated responses with redacted credentials.
- `http/W6-findings-backfill-spoof.json` captures the authenticated findings route response.
- `readback/ruleset-created-by.json` is an independent PostgreSQL query assertion that persisted actor attribution is the verified actor and not the forged header value.
- `doctor.txt` captures independent local web/collector health checks.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/collector-build.log | log | aux · unrecognized .log | 952a8e5423163b252a6524bdbf50c26e9207d1e3acd0dd80e54f4deac4d2c992 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/env.txt | env | aux | 0df965220f59244c81076bde7dab151bc1cd7e2c3af0fec50fb406cc17249ecc |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/http/C1-collector-valid-spoof.json | http | evidence | 61b077522532c155559014825944f9442c464760540960030086a6c4d5d53c83 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/http/C2-collector-unknown.json | http | evidence | d297a1d651258a47c9dc845d591dfee9f34da0455e665c0b40a2eb836e647efb |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/http/C3-collector-disabled.json | http | evidence | e53856cf7846d7386382be132669fef3c66cb9fc47ce05cc2cd8128902f5d861 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/http/C4-collector-forged-legacy.json | http | evidence | e5c82490c74ec4ea2083e4c85af5f98547407336408bfea5f243839c15523fff |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/http/C5-collector-no-credential.json | http | evidence | 6d092d9963e4683451a9ce1e3e8bdfaaf77e6458f0ffe4f50ce0a94f6834587a |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/http/W1-web-valid-spoof.json | http | evidence | a3f6f7a1c21209e1cf779d6c9b03f1d429c74759e5bee1d10587e569b3506307 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/http/W2-web-unknown.json | http | evidence | bc8fc0eb0a20c1a44fb2376034037e970d0fe9b00f500b906ba11f5629821af0 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/http/W3-web-disabled.json | http | evidence | 59dd137efefb9262559b11eb0eb76be804c8220f4bb144b7ad49602b1b17962b |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/http/W4-web-forged-legacy.json | http | evidence | 93de834f969a0fa6ccad7bf485305c980b4704cc37cb198178b3e6d3dc841170 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/http/W5-web-no-credential.json | http | evidence | fa57884e85cb01d7b39c83936a07fa07c5b47ce9834aff229a9ab4f540719a06 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/http/W6-findings-backfill-spoof.json | http | evidence | 58c734180492f11bdf5104e28affcbcf214be8506d0feab4f2bb631c3d796c94 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/local-postgres.log | log | aux · unrecognized .log | 33780b62dfa0626b782e95f1719b6783d67706fc6aa219746a97a738bd1e6bc3 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/observations.md | md | aux · unrecognized .md | ba98709a7fc149ec5aa001a506f43f94e39de2d2a350a883558015338baf6abc |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/readback/ruleset-created-by.json | readback | evidence | a75a51026e0384f909a30ff36c69e970afc0a0fa132f1802f56524e4024984f3 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/runtime-migrations.txt | txt | aux · unrecognized .txt | 563aa3a9cd3de102c57481ff8a1c14c8b5881a4b5bb38fa813b4ec82a1861f92 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/runtime-safety.txt | txt | aux · unrecognized .txt | dc2db0d897dcf48231dd14d9e59b86333e1535d71acd458d03f431289bcf4a6f |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/tests-api-principal.log | log | aux · unrecognized .log | f88c952d17b06f4b7526829fc7a58785d80c79b422573f68048d108eada84ee8 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/tests-auth-env-validation.log | log | aux · unrecognized .log | f65f23ce5184e2bf2a6a63b59ea67172ae659558ec019e9895e0c9ec52f2a969 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/tests-collector-auth-forged-identity.log | log | aux · unrecognized .log | 3ef07e507faecdaa3545700d3a0f6914100c9b8e378744351b53a83dabd3c693 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/tests-collector-forged-identity-routes.log | log | aux · unrecognized .log | 7d4f5a0408d0bb5c34b20a47eede5724a66a550a9b75a495f64b7a4b82e53c4e |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/tests-findings-actor-spoof.log | log | aux · unrecognized .log | c4f11d06ad989682eccf8c140bc1835b017bdc4f571823c296e791671104788d |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/tests-web-auth-e2e.log | log | aux · unrecognized .log | de4463cc779c49921a0f12208f70b2a1118bd28683c4810b31d0a12271d41fd4 |
| verification/runs/20260901-023948Z-39abbcc-fresh-issue66/tests-web-auth-forged-identity.log | log | aux · unrecognized .log | fb04909ce49cff00d81753657a380fea48d0922aa8b5e92d6ef3014b1ef6973a |
