---
receipt: verification-receipt/v0
run_id: 20260901-042638Z-e5d6469-fresh-auth-login
feature_id: auth.login
profile: critical
surface: web
sha: e5d6469f040670b38610b0aa714bb3c62b001152
code_digest: 2de8656424bebd152128044c8e074cf0a6e5f463a15a2d14eab66f3d0c1c88ff
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-local-worktree-e5d6469"
evidence_dir: verification/runs/20260901-042638Z-e5d6469-fresh-auth-login
created_at: 2026-09-01T04:41:20.765Z
---

# Receipt: auth.login — passed

## Observations (expected → seen)

- Fresh isolated worktree was checked out at exact committed HEAD `e5d6469f040670b38610b0aa714bb3c62b001152`; no product files were changed. The web production artifact ran on loopback against a disposable PostgreSQL container; no production service, provider, OAuth, or real credential was contacted.
- Real `/login` user path was driven with Playwright: fields **Email address** and **Password** were filled by label, **Sign in** was clicked by role, and the page landed at `/` with heading **DNS Ops Workbench**. `signed-in-home.png` and `trace.zip` retain the resulting state; no dev-auth headers were supplied.
- Independent browser read-back `GET /api/auth/me` using the session cookie returned HTTP 200 with `authenticated=true`, email `fresh-verifier-e5d6469@example.invalid`, and tenant `550e8400-e29b-41d4-a716-446655440000`.
- `POST /api/auth/signup` returned HTTP 403 with registration disabled. A wrong-password `POST /api/auth/login` returned HTTP 401 and no `Set-Cookie`. An unauthenticated `GET /api/auth/me` returned HTTP 401 with `authenticated=false`.

## Forbidden (must not happen → confirmed absent)

- Failed login did not issue a session cookie; the redacted HTTP exchange records no `Set-Cookie` header.
- Signup did not succeed; the redacted HTTP exchange records HTTP 403.
- Unauthenticated requests did not open the workbench; the successful workbench state followed the valid form login only. The browser evidence log contains one expected pre-login 401 for `/api/auth/me`.
- Raw password and session token values do not appear in evidence; password fields are `[REDACTED]`, and session cookies/tokens are omitted from captured artifacts.

## Read-back (side effects checked through an independent path)

- Independent PostgreSQL query counted `active_sessions=1` for the verification email with session tokens omitted, confirming the successful login persisted a session.
- Focused auth lifecycle suites passed: 3 files, 56 tests. `signed-in-home.png` captures the required workbench heading and `readback/me.json` captures the authenticated session response.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/console.log | log | aux · unrecognized .log | 74f442c997f3ca0140869dff653f33eb591de0f0a0c24067d9a7c329b8ee5172 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/env.txt | env | aux | 5c260b34ead90f0834b3a81c5acc319855a9ea04ec476aa4b6e16b4644aeb329 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/failed-requests.log | log | aux · unrecognized .log | cbf6e570baa107fec6b4462a4d10869100829932da376c3788372cbb499f08e2 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/http/30-L1-signup-stays-403.json | http | evidence | 12fc5b35c88fa4d88f968a390fb86375ce3dd173b4c8e31bcf7b1b472ed16848 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/http/31-L2-failed-login-no-cookie.json | http | evidence | 72df362976961d0a9172c712cca69d84cc6d9ad6b99ab5aaaa9aaf6d5e20bf35 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/http/32-L3-anonymous-me-401.json | http | evidence | d7fee7f7a608a93b93d576cdbc1c9c6e3959b019a5f5d6935ccd4145f1c4b947 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/login-drive.log | log | aux · unrecognized .log | 97be6057ad7f6fbf6df1cfeea90a3b7b06d650a8df0f82eef2a02d3b789a5a99 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/login-focused-tests.log | log | aux · unrecognized .log | 3b1fa5055c7941356bb9e1c79b240a03c1a0008e5b2f173e7798c45ba3599e1c |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/login-forbidden-summary.txt | txt | aux · unrecognized .txt | 84dbcfc85ea6c9e5984c3baf046ad1d9ad7cb96e016a4ceaf4e4b52130f8c5e3 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/login-negative-probes.log | log | aux · unrecognized .log | e639be9346791073db735f8f8922f459c39a95f282266dfe26db743c8b44f403 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/observations.md | md | aux · unrecognized .md | 8196e0520e9b7f583bec35666eba67366e0e0e753813c4ae913df8282cd5cf81 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/readback/me.json | readback | evidence | 680df30bd6fe31cd2b93aae234526c929ffeca813f3fc501706b63c2a4399cf6 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/readback/sessions.json | readback | evidence | b79762e11ec58ebda75f80ee76960a528607d89ac9af304c56d508d3eb8f65c6 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/seed-user.log | log | aux · unrecognized .log | 84307c6bd84446529ed67cbb9af73e6d6d90a069157b8b40853dc627dbed966b |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/signed-in-home.png | png | evidence · 1280x1207 | 5fd0f3f798b84f2223313494a486685cc7c78baa9ad36a2cafea22ec36e74a81 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/trace.zip | trace | evidence · playwright trace | c22ad339a31b482d820c0a86ce59630c1667b241b0552ae4ce898d089e057e6b |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/video/c722171d4c160327f3fba861721967d3.webm | video | evidence | c53f46a99abf5be03c41fe324ba4e31363348380d9fb657dc2ccde32ab6e2d28 |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/web-build.log | log | aux · unrecognized .log | 2d35a418c0267bcd2ee18f105c1bc0973141296ecd9aa31f5ee0b61103c4703f |
| verification/runs/20260901-042638Z-e5d6469-fresh-auth-login/web-prod-start.log | log | aux · unrecognized .log | 8d9419d8856eccf4bd795f86e2e98f5043783fbc3c65897847da0c0eee169d79 |
