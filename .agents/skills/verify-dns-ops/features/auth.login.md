---
id: auth.login
surface: web
profile: critical
paths:
  - apps/web/app/routes/login.tsx
  - apps/web/hono/routes/signup.ts
  - apps/web/app/api.ts
  - apps/web/hono/middleware/auth.ts
  - apps/web/app/lib/auth-guard.ts
always_with: []
---
# Sign in

An operator signs in with email and password so tenant-scoped write paths work. Signup is disabled.

## Sub-features

- Login form at `/login` (labels **Email address** and **Password**, submit **Sign in**).
- `POST /api/auth/login` creates a session cookie.
- Failed login stays on the form with an error; it must not open the workbench.

## How to get to it (user POV)

1. Open `/login`.
2. Fill **Email address** and **Password**.
3. Click **Sign in**.
4. Land on `/` with heading **DNS Ops Workbench**.

## Driving it with harness/web.mts

```ts
await page.goto(`${BASE_URL}/login`);
await page.getByLabel('Email address').fill(process.env.VERIFY_USER);
await page.getByLabel('Password').fill(process.env.VERIFY_PASS);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('heading', { name: /dns ops workbench/i }).waitFor({ timeout: 15_000 });
```

Local e2e may instead send `X-Dev-Tenant` and `X-Dev-Actor` (see `apps/web/playwright.config.mjs`). That bypass is not a login proof; say so if you used it.

## Proof

### Expected observations
- After success, URL is `/` and heading **DNS Ops Workbench** is visible.
- Independent `GET /api/auth/me` with the same cookie is 200.

### Forbidden observations
- Signup succeeding (`POST /api/auth/signup` must stay 403).
- Session cookie issued after 401.
- Class selectors or coordinate clicks.

### Read-back
- `GET /api/auth/me` returns the signed-in user; a request without the cookie is 401.

## Gotchas

- Password input `minLength={8}`.
- Login cookies are scheme-aware `Secure`; HTTP local sessions fail if the cookie is marked Secure-only on https-only config.
- No seeded verification user ships in the repo. Missing `VERIFY_USER`/`VERIFY_PASS` and no DB is `blocked`, not `failed`.
