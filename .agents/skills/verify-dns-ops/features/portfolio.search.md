---
id: portfolio.search
surface: web
profile: critical
paths:
  - apps/web/app/routes/portfolio.tsx
  - apps/web/app/components/PortfolioSearchPanel.tsx
  - apps/web/app/components/BuiltInViewsPanel.tsx
  - apps/web/app/lib/built-in-views.ts
  - apps/web/app/lib/built-in-views.test.ts
  - apps/web/app/components/SavedFiltersPanel.tsx
  - apps/web/app/lib/portfolio-filters.ts
  - apps/web/hono/routes/portfolio.ts
  - apps/web/hono/routes/portfolio.test.ts
  - apps/web/e2e/portfolio-expiry.spec.ts
  - .agents/skills/verify-dns-ops/harness/web.mts
always_with: []
---
# Search the portfolio

An operator opens Portfolio workflows and searches tenant domains by query/tag.

## Sub-features

- Route `/portfolio` shows heading **Portfolio workflows** and **Portfolio Search**.
- Query field labeled **Query**.
- The **Built-in views** panel opens the workspace with three one-click views: **Mail broken**, **Expiring evidence**, and **Incomplete coverage** (issue #63). Selecting a view drives `POST /api/portfolio/search` with the view criteria (`findingTypePrefix: "mail."` plus high/critical severities, `snapshotOlderThanDays: 30`, `coverage: "incomplete"`); selecting the active view again clears it.
- **Expiry window** select (Any / Within 7 days / Within 30 days / Within 90 days) feeds `expirationWithinDays` into the search request body.
- Results render as a semantic table with an **Expiry** column: localized date plus bucket for OBSERVED rows, literal `UNKNOWN` otherwise.
- Saved filters round-trip `expirationWithinDays` via Save Current / Load.
- Saved filters, monitored domains, alerts, and related panels are present on the same page (chrome only unless the feature file is expanded).

## How to get to it (user POV)

1. Open `/portfolio` while signed in (or local e2e headers).
2. Confirm **Portfolio Search** and the **Query** field.
3. Type a domain fragment in **Query** and observe results or an empty valid set.
4. Activate each built-in view button and observe the filtered result set; activate the active view again to clear it.

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
- The **Built-in views** panel shows the three view buttons; each click issues `POST /api/portfolio/search` whose request body carries that view's criteria, the button becomes `aria-pressed="true"`, and re-clicking removes the criteria.
- View result sets respect the criteria server-side: `findingTypePrefix` returns only domains with matching-type findings (unevaluated domains are kept), `snapshotOlderThanDays` returns only domains whose latest snapshot is older, `coverage: "incomplete"` returns only domains whose evidence is not fully evaluated (a domain without a snapshot counts as incomplete).
- **Expiry window** select is present and offers Any/7/30/90; choosing a window sends `expirationWithinDays` in the `POST /api/portfolio/search` body.
- The results table has an **Expiry** column; rows without usable RDAP evidence show literal `UNKNOWN`.

### Forbidden observations
- Treating the sign-in warning (“Operator sign-in is required to search tenant domains”) as a successful search.
- Class selectors.

### Read-back
- `POST /api/portfolio/search` with the same session/headers returns 200 JSON `{ domains: [...] }` (empty array is valid).
- The same POST issued directly with each built-in view's criteria returns a subset consistent with the button-driven result set (server-side enforcement, not client-only filtering).

## Gotchas

- Search is tenant-scoped. Without auth, the panel shows the sign-in warning; receipt is `blocked`.
- Writes (alerts, shared reports) are out of scope for this feature id.
