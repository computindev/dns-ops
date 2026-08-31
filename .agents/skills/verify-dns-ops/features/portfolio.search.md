---
id: portfolio.search
surface: web
profile: critical
paths:
  - apps/web/app/routes/portfolio.tsx
  - apps/web/app/components/PortfolioSearchPanel.tsx
  - apps/web/hono/routes/portfolio.ts
always_with: []
---
# Search the portfolio

An operator opens Portfolio workflows and searches tenant domains by query/tag.

## Sub-features

- Route `/portfolio` shows heading **Portfolio workflows** and **Portfolio Search**.
- Query field labeled **Query**.
- Saved filters, monitored domains, alerts, and related panels are present on the same page (chrome only unless the feature file is expanded).

## How to get to it (user POV)

1. Open `/portfolio` while signed in (or local e2e headers).
2. Confirm **Portfolio Search** and the **Query** field.
3. Type a domain fragment in **Query** and observe results or an empty valid set.

## Driving it with harness/web.mts

```ts
await page.goto(`${BASE_URL}/portfolio`);
await page.getByRole('heading', { name: /portfolio workflows/i }).waitFor({ timeout: 15_000 });
await page.getByRole('heading', { name: /portfolio search/i }).waitFor();
await page.getByLabel('Query').fill('example.com');
```

## Proof

### Expected observations
- Headings **Portfolio workflows** and **Portfolio Search** are visible.
- **Query** accepts input.

### Forbidden observations
- Treating the sign-in warning (“Operator sign-in is required to search tenant domains”) as a successful search.
- Class selectors.

### Read-back
- `POST /api/portfolio/search` with the same session/headers returns 200 JSON `{ domains: [...] }` (empty array is valid).

## Gotchas

- Search is tenant-scoped. Without auth, the panel shows the sign-in warning; receipt is `blocked`.
- Writes (alerts, shared reports) are out of scope for this feature id.
