---
receipt: verification-receipt/v0
run_id: 20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized
feature_id: auth.login
profile: critical
surface: web
sha: ed2bdbda1c82e58e4ee26733d9a27c838676d166
code_digest: 276e22d7929f5fd89dd6a4a43340dae4fd7638015604924149027c031850fed2
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-independent-final66-local-production-web-sanitized"
evidence_dir: verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized
created_at: 2026-09-01T08:27:51.286Z
---

# Receipt: auth.login — passed

## Observations (expected → seen)

- Clean exact product tree `ed2bdbda1c82e58e4ee26733d9a27c838676d166` → `run-new` recorded `dirty: false`, `untracked: 0`; the production web artifact was served from this isolated checkout.
- `/login` form → Playwright filled **Email address** and **Password** by accessible labels, clicked **Sign in** by role, and reached `/` with the **DNS Ops Workbench** heading; no development-auth headers were supplied.
- Independent authenticated `GET /api/auth/me` with the session cookie → HTTP 200 with `authenticated: true`, the disposable verifier email, and the seeded tenant UUID.
- Wrong-password `POST /api/auth/login` → HTTP 401 with no `Set-Cookie` response header.
- `POST /api/auth/signup` → HTTP 403 with registration disabled.
- Unauthenticated `GET /api/auth/me` → HTTP 401 with `authenticated: false`.
- The Playwright trace started after the login credentials were submitted; credential fields are redacted in all HTTP/read-back evidence.

## Forbidden (must not happen → confirmed absent)

- Failed login must not issue a session cookie → the redacted negative exchange has no `Set-Cookie` header and the driver asserted its absence.
- Signup must not succeed → the captured response was HTTP 403.
- Unauthenticated access must not open the workbench → only the valid form login reached the workbench heading; the anonymous read-back was HTTP 401.
- Real credentials or production/OAuth/provider paths must not be used → only disposable local credentials, loopback web/collector, and local PostgreSQL were used.

## Read-back (side effects checked through an independent path)

- Browser session after form login → independent `/api/auth/me` response was HTTP 200 and authenticated.
- Disposable local PostgreSQL session row → the login flow persisted one active session for the verifier user; session token values were not captured.
- Redacted HTTP exchanges → independently confirm signup-disabled, failed-login/no-cookie, and anonymous-auth boundaries.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized/console.log | log | aux · unrecognized .log | 74f442c997f3ca0140869dff653f33eb591de0f0a0c24067d9a7c329b8ee5172 |
| verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized/env.txt | env | aux | e4f2c2fc98e0304250f4c9ea3a096b87607859ea63360ca7dfd61624a31fbe49 |
| verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized/failed-requests.log | log | aux · unrecognized .log | b946524320d31adf749a79889315f5f7dc31e4d4aeef2596a17c37ff34c06713 |
| verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized/http/30-signup-disabled.json | http | evidence | d7f8e69ad5eb0b042cd97cd70ef0fe05283ddeb7482998171a31a8f768b84cb3 |
| verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized/http/31-failed-login-no-cookie.json | http | evidence | 053b7d0c55b7a7f6c2a17e3d93939dce81b7213bd29464fabfe9b029bbf0ced6 |
| verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized/http/32-anonymous-me-401.json | http | evidence | 2aae8da8f0afab79b6d6f6a0b596e9e2829da84c0620bbdc7748e11de0fb1684 |
| verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized/login-drive.log | log | aux · unrecognized .log | 046339d9e466e7c65843c58ce195e5166f020a6e16c363d50158266b39328be7 |
| verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized/login-negative-summary.txt | txt | aux · unrecognized .txt | f477cb2c9ad880b97028d4236b6439ad3165cd348dfa0eb94b517198183edcd6 |
| verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized/login-summary.txt | txt | aux · unrecognized .txt | 400471135aae9b71f442378fc9aa828ab25550a5e00fb73df34dcce278777376 |
| verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized/observations.md | md | aux · unrecognized .md | e377ac1df74693079830d8210c2934d6c61e42a05ee34127f491cc89b49fe2d4 |
| verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized/readback/me.json | readback | evidence | 4e99d94658d5105e5e88b689b95eabb7df1017ae951fa01196850f1a5f25e05b |
| verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized/signed-in-home.png | png | evidence · 1280x1207 | 8cef63f650e73bab9a848159157c133cb7e2c69692949fc9146a52a018916b0a |
| verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized/trace.zip | trace | evidence · playwright trace | 808656a35bfd50e1ac201781adc2374c84fd720dc22262f2daa2cfc193d8860e |
| verification/runs/20260901-082701Z-ed2bdbd-final-fresh-auth-login-sanitized/video/9ca1c8da330a2e6129dd3afb4cd9dc85.webm | video | evidence | dc0d25cb937bf00e34e358c7e4445f9aeb72bb35c330aeb763392b66df640eff |
