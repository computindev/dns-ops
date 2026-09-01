---
receipt: verification-receipt/v0
run_id: 20260901-034318Z-6655248-fresh-issue66-auth-login
feature_id: auth.login
profile: critical
surface: web
sha: 66552480a4a8fffc0ba32429b6c362c52c918ee5
code_digest: 057dfbd646a785da85a624aff06934b29bfbeb2d31bffc9b456fce7d955fdbcb
dirty: false
untracked: 1
status: passed
reason: ""
verifier: fresh
verifier_session: "playwright-web-prod:3002,isolated-postgres"
evidence_dir: verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-login
created_at: 2026-09-01T03:59:49.181Z
---

# Receipt: auth.login — passed

## Observations (expected → seen)

- Real login form path at the production web start artifact: opened `/login`, filled labels `Email address` and `Password`, clicked role `Sign in`, and landed at `/` with heading `DNS Ops Workbench`; no dev-auth headers were supplied.
- Independent `GET /api/auth/me` using the browser session cookie returned HTTP 200 with `authenticated=true`, email `antonio.correa@gmail.com`, and tenant `f9385b75-6bb7-56e7-8776-ecfec2ba06aa`.
- `POST /api/auth/signup` returned HTTP 403 with `Registration is disabled.`.
- Wrong-password `POST /api/auth/login` returned HTTP 401 and no `Set-Cookie`; `GET /api/auth/me` without a cookie returned HTTP 401 with `authenticated=false`.

## Forbidden (must not happen → confirmed absent)

- Failed login must not issue a session cookie → redacted HTTP probe recorded `set-cookie-present=false` for the HTTP 401 response.
- Signup must remain disabled → redacted HTTP probe recorded HTTP 403.
- Unauthenticated requests must not open the workbench → no-cookie `/api/auth/me` recorded HTTP 401; the successful workbench state followed only the valid form login.
- Raw password or session token must not appear in evidence → password request fields are `[REDACTED]`; session tokens/cookies were omitted from captured HTTP and read-back artifacts.

## Read-back (side effects checked through an independent path)

- PostgreSQL query grouped active sessions by the verification email (session token omitted) returned `active_sessions=1` and assertion `sessionPersisted=true`.
- `readback/me.json` is the authenticated session read-back; `signed-in-home.png` captures the resulting workbench state.
- The focused auth suite in the same fresh tree passed, including the 11 auth lifecycle tests.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-login/console.log | log | aux · unrecognized .log | 74f442c997f3ca0140869dff653f33eb591de0f0a0c24067d9a7c329b8ee5172 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-login/env.txt | env | aux | 3ddfc7581ad327aa07a031204ed32c18b104f21c5f31c01e32207796a8f1020c |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-login/failed-requests.log | log | aux · unrecognized .log | 58c589f024cb2cde70c2df055ebbbc1fe9e69092cad71d3ca7b0d36e907651db |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-login/http/L1-signup-stays-403.json | http | evidence | 6cb0501425ee1dc1b27fc51a66d3ab4bdf67e5dbfa92f2d8e5294a6bec66c7ee |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-login/http/L2-failed-login-no-cookie.json | http | evidence | 9d1338126a83e0305890662569c34d38eb3b9b530c3da1177d32edbc6de89ae2 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-login/http/L3-me-without-cookie-401.json | http | evidence | 027973fed5d8681ff83d1f1bf635d52b0a1abd4723097aa386f5ba9bc4acad44 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-login/login-forbidden-probes.txt | txt | aux · unrecognized .txt | e3c2ce8b85ba52c1f42ebd7d9ba4b0fabe395a6f3754bba72ab4f81fceb6ec21 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-login/observations.md | md | aux · unrecognized .md | e7f503724cfefcc301ddd2de9679f21e5f03ae89137bba3f08fc1d0aa06dd86c |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-login/readback/me.json | readback | evidence | c2165e20cbfcd36ccc55350fac7f48d72a95a454edcc9d30a31a7db20778cf00 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-login/readback/session-created.json | readback | evidence | 52a7d4852ec86ff5e65cb3168e6c649d59228576b3b89e3df68a5568d9e9d717 |
| verification/runs/20260901-034318Z-6655248-fresh-issue66-auth-login/signed-in-home.png | png | evidence · 1280x1207 | df76f3e67771a97de95c5295005bc73d03cc9b5d14ced4981c7a20cfe7e3549b |
