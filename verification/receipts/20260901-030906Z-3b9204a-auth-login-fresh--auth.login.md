---
receipt: verification-receipt/v0
run_id: 20260901-030906Z-3b9204a-auth-login-fresh
feature_id: auth.login
profile: critical
surface: web
sha: 3b9204a4306bf17e477022b491dd035d1d2d1712
code_digest: d8d15a8c15358ed3c0c9bcf794aca8774dd42fec165e2e33cc9d5054c20145f0
dirty: true
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-local-web:3002+isolated-postgres"
evidence_dir: verification/runs/20260901-030906Z-3b9204a-auth-login-fresh
created_at: 2026-09-01T03:17:30.527Z
---

# Receipt: auth.login — passed

# auth.login — fresh verification observations

Independent fresh verifier session against receipt-only HEAD `3b9204a4306bf17e477022b491dd035d1d2d1712`. Product code was not changed. The web service ran locally from this checkout on `127.0.0.1:3002` against an isolated disposable PostgreSQL container; no production service, provider, OAuth, or real credential was contacted. The login password was a throwaway redacted marker and is represented only as `[REDACTED]` in captured evidence.

## Drive (harness/web.mts, real user path)

- Opened `/login`, filled **Email address** and **Password** by label, and clicked **Sign in** by role.
- Landed on `/` with heading **DNS Ops Workbench**; screenshot: `signed-in-home.png`.
- Independent read-back `GET /api/auth/me` using the session cookie returned 200 with `authenticated: true`, the throwaway verification email, and the seeded local tenant (`readback/me.json`).

## Forbidden observations (HTTP probes)

- `POST /api/auth/signup` returned 403 with registration disabled (`http/L1-signup-stays-403.json`).
- Failed password login returned 401 and issued no session cookie (`http/L2-failed-login-no-cookie.json`).
- `GET /api/auth/me` without a cookie returned 401 with `authenticated: false` (`http/L3-me-without-cookie-401.json`).

## Safety and redaction

- All services and database were loopback-only and disposable.
- No production/provider endpoint, live OAuth flow, active probe, raw password, session token, or database credential appears in evidence; credential-bearing values are redacted.
- Focused `apps/web/hono/routes/auth-e2e.test.ts` passed: 11 tests.
- The doctor run reported 5 checks ok and 0 failed.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-030906Z-3b9204a-auth-login-fresh/console.log | log | aux · unrecognized .log | 74f442c997f3ca0140869dff653f33eb591de0f0a0c24067d9a7c329b8ee5172 |
| verification/runs/20260901-030906Z-3b9204a-auth-login-fresh/doctor.txt | txt | aux · unrecognized .txt | a912c2353c5e9b993b5c1254fd1c0e609ebd4c159750bebcb0a91801f3924a62 |
| verification/runs/20260901-030906Z-3b9204a-auth-login-fresh/failed-requests.log | log | aux · unrecognized .log | 58c589f024cb2cde70c2df055ebbbc1fe9e69092cad71d3ca7b0d36e907651db |
| verification/runs/20260901-030906Z-3b9204a-auth-login-fresh/focused-auth-e2e.log | log | aux · unrecognized .log | 2a026cc7297ec1a4000cda737ac4c881f3a59beaee1cba50c1ca22b9bca05e0c |
| verification/runs/20260901-030906Z-3b9204a-auth-login-fresh/http/L1-signup-stays-403.json | http | evidence | 43b629cb66e98bed52feb38782ed66f2eba1d642c80448ef6c3350f306f196cb |
| verification/runs/20260901-030906Z-3b9204a-auth-login-fresh/http/L2-failed-login-no-cookie.json | http | evidence | e29e2675b2e56d0402f91841211cd7c107c2a235ac51eee9ee5dbb83458f8470 |
| verification/runs/20260901-030906Z-3b9204a-auth-login-fresh/http/L3-me-without-cookie-401.json | http | evidence | 12be6f42ad43680f4ffe7bb0c507bfe062c601fa509d197ab42b754bbf798cf2 |
| verification/runs/20260901-030906Z-3b9204a-auth-login-fresh/observations.md | md | aux · unrecognized .md | 35d201d1f56992e84247bc5e230befaffbaa06e04b546e53b93ca123727e60c1 |
| verification/runs/20260901-030906Z-3b9204a-auth-login-fresh/readback/me.json | readback | evidence | 9525bd821afe68f615f13020f7909c87a8e60b4c2cd6a8244c3e7901578e15c6 |
| verification/runs/20260901-030906Z-3b9204a-auth-login-fresh/signed-in-home.png | png | evidence · 1280x1207 | 15506c1ed1d6947d59633c51ab8dc6ba4017a19ba4e806d9d5cbe6c9b21d6c13 |
| verification/runs/20260901-030906Z-3b9204a-auth-login-fresh/trace.zip | trace | evidence · playwright trace | 2ca378c8b4ec4af8e0bf32b756504b1a03bb093a474cd7f5c81ecb73288c54ae |
| verification/runs/20260901-030906Z-3b9204a-auth-login-fresh/video/c683f57a22384bf039b25d74f5d62b51.webm | video | evidence | 3e860258388491ebe13a5047d94576ef789062382df2676d22d3470f4c17f4a6 |
