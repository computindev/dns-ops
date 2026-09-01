---
receipt: verification-receipt/v0
run_id: 20260901-103612Z-aad22b9-wave1-qa-auth-login
feature_id: auth.login
profile: critical
surface: web
sha: aad22b9ce0acb4a5cbbe8b95e06651466a73f8ed
code_digest: ba8b0a0068efbcc82e351a6db480d965fd98f511c5aec310c888b56f74879a6f
dirty: false
untracked: 0
status: passed
reason: ""
verifier: fresh
verifier_session: "fresh-local-loopback-web-disposable-postgres"
evidence_dir: verification/runs/20260901-103612Z-aad22b9-wave1-qa-auth-login
created_at: 2026-09-01T10:38:58.484Z
---

# Receipt: auth.login — passed

## Observations (expected → seen)

- A clean isolated worktree at exact product SHA `aad22b9ce0acb4a5cbbe8b95e06651466a73f8ed` recorded `dirty: false` and `untracked: 0` before driving. The production web artifact was served locally on loopback against a disposable local PostgreSQL database; no development-auth headers were supplied.
- The real `/login` form was opened. Accessible labels `Email address` and `Password` were filled, the role-labeled `Sign in` button was clicked, and the browser landed at `/` with the `DNS Ops Workbench` heading.

## Forbidden (must not happen → confirmed absent)

- No production service, provider, OAuth flow, or real credential was contacted. The login credential was throwaway and is not present in this receipt or captured text evidence.
- No raw password or session cookie was printed. The pre-login unauthenticated `/api/auth/me` check was the expected 401 while the form was open; it did not prevent login.
- Signup remains disabled and invalid-login rejection is covered by the exact-tree auth e2e tests run in this verification session.

## Read-back (side effects checked through an independent path)

- After the successful form submission, an independent browser-context `GET /api/auth/me` returned HTTP 200 with `authenticated: true`, the throwaway verifier email, and the expected tenant. The signed-in screenshot and Playwright trace retain the resulting home state.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-103612Z-aad22b9-wave1-qa-auth-login/console.log | log | aux · unrecognized .log | 74f442c997f3ca0140869dff653f33eb591de0f0a0c24067d9a7c329b8ee5172 |
| verification/runs/20260901-103612Z-aad22b9-wave1-qa-auth-login/env.txt | env | aux | 211fc9790d6797409daca2e24566c66a6353a11d44bf93a5ece340070ff0b041 |
| verification/runs/20260901-103612Z-aad22b9-wave1-qa-auth-login/failed-requests.log | log | aux · unrecognized .log | 79533e8cad58811984ffd3cc00ffcfeac862b5f47860641728a8661b98e7f5c2 |
| verification/runs/20260901-103612Z-aad22b9-wave1-qa-auth-login/readback/me.json | readback | evidence | 809555ef03f647f109d9e876872a2e33c7ba89f419dde5478ed45f6bee02410e |
| verification/runs/20260901-103612Z-aad22b9-wave1-qa-auth-login/signed-in-home.png | png | evidence · 1280x1207 | c26dcb21dd428283d1c59ddf1d294f5dbfa4036bad04dde5486efc979056ce6c |
| verification/runs/20260901-103612Z-aad22b9-wave1-qa-auth-login/trace.zip | trace | evidence · playwright trace | 07d4f33ce9fb7ca59986b851c3639dc420452d15053e955709a307bc533ec170 |
| verification/runs/20260901-103612Z-aad22b9-wave1-qa-auth-login/video/7c7496ed38926fcafdb76178350b4222.webm | video | evidence | 5cf89d026e189ab33eca944700a4bc9b4bbb5654bf09661793faf3e02993f1e4 |
