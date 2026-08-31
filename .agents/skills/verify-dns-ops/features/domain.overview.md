---
id: domain.overview
surface: web
profile: changed
paths:
  - apps/web/app/routes/index.tsx
  - apps/web/app/routes/domain/$domain.tsx
  - apps/web/app/components/DomainInput.tsx
always_with: []
---
# Open Domain 360

An operator types a domain on the home page and opens Domain 360 (overview / DNS / mail / delegation / history).

## Sub-features

- Home textbox **Domain name** and button **Analyze**.
- Navigation to `/domain/{domain}` with a heading containing that domain.
- Tabs **Overview**, **DNS**, **Mail**, **Delegation**, **History**.

## How to get to it (user POV)

1. Open `/` (must already be authenticated or using local e2e headers).
2. Fill **Domain name** with e.g. `google.com`.
3. Click **Analyze**.
4. See Domain 360 for that name.

## Driving it with harness/web.mts

```ts
await page.goto(`${BASE_URL}/`);
await page.getByRole('textbox', { name: /domain name/i }).fill('google.com');
await page.getByRole('button', { name: /analyze/i }).click();
await page.getByRole('heading', { name: /google\.com/i }).waitFor({ timeout: 15_000 });
await page.getByRole('tab', { name: /overview/i }).waitFor();
```

## Proof

### Expected observations
- URL matches `/domain/google.com`.
- Tabs Overview, DNS, Mail, Delegation, History are visible.

### Forbidden observations
- Staying on `/` after Analyze with a valid domain.
- Driving with CSS class selectors.

### Read-back
- The Domain 360 heading shows the submitted domain. Snapshot/findings JSON is optional; empty snapshot is allowed.

## Gotchas

- Home `beforeLoad` requires auth (`requireAuthGuard`). Unauthenticated visits bounce; that is `blocked` until login or e2e headers.
- Live collection needs collector + `COLLECTOR_URL`. Overview chrome can still render without a snapshot.
