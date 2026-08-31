---
id: fleet.reports
surface: web
profile: changed
paths:
  - apps/collector/src/jobs/fleet-report.ts
  - apps/collector/src/jobs/fleet-report.logic.test.ts
  - apps/collector/src/jobs/fleet-report.test.ts
  - apps/web/hono/routes/fleet-report.ts
  - apps/web/hono/routes/fleet-report.test.ts
  - apps/web/app/components/FleetReportsPanel.tsx
  - apps/web/app/components/FleetReportsPanel.test.ts
  - apps/web/e2e/fleet-report.spec.ts
always_with: []
---
# Fleet reports

An operator runs bulk mail/infrastructure/delegation checks across a domain inventory from Portfolio workflows and reads per-domain, per-check verdicts backed by persisted findings.

## Sub-features

- Route `/portfolio` shows the **Fleet Reports** panel with template cards (**Mail Security Baseline**, **Infrastructure Audit**, **Full Check**), a domain inventory textarea, CSV import, and **Run Report**.
- `POST /api/fleet-report/run` (web → collector) returns per-domain checks with status `pass | fail | warning | unknown` and per-check summary stats including `unknown` counts.
- `POST /api/fleet-report/import-csv` parses a `domain` column into an inventory.

## Truth model (what this feature promises)

- `pass` requires affirmative persisted evidence: a complete snapshot, explicit `COMPLETE` evaluation coverage, a non-null snapshot ruleset, and findings from that same snapshot+ruleset whose evidence observation IDs belong to the snapshot.
- Zero relevant findings, missing/partial evaluation coverage, or uncorrelated evidence (wrong ruleset, empty evidence, foreign observation ID) ⇒ `unknown`, never `pass`.
- Unrecognized severities ⇒ `unknown`, never `pass`.
- Affirmative info/low ⇒ `pass`, medium ⇒ `warning`, high/critical ⇒ `fail`.

## How to get to it (user POV)

1. Open `/portfolio` while signed in (or local e2e headers).
2. Confirm the **Fleet Reports** heading and the **Report Template** cards.
3. Enter one or more collected domains in **Domain Inventory**, pick a template, select **Run Report**.
4. Expand **Show Domain Details** and read the per-check badges.

## Driving it with harness/web.mts

```ts
await page.goto(`${BASE_URL}/portfolio`);
await page.getByRole('heading', { name: /fleet reports/i }).waitFor({ timeout: 15_000 });
await page.getByLabelText(/domain inventory/i).fill('stale.example');
await page.getByRole('button', { name: /mail security baseline/i }).click();
await page.getByRole('button', { name: /run report/i }).click();
await page.getByRole('button', { name: /show domain details/i }).waitFor({ timeout: 30_000 });
```

## Proof

### Expected observations
- For a domain whose latest snapshot lacks explicit `COMPLETE` evaluation coverage (or whose findings are uncorrelated), the SPF row badge renders UNKNOWN styling (`?` / unknown badge class), not a success badge.
- `POST /api/fleet-report/run` for that domain returns `checks[].status === 'unknown'` and summary stats `unknown >= 1`, `pass === 0`.
- For a complete, correlated snapshot, a persisted info finding yields `pass` and a high finding yields `fail`.

### Forbidden observations
- Any check reporting `pass` without persisted, correlated findings evidence (false green).
- Treating “No snapshots available / Findings not evaluated” errors as a `pass`.
- Class selectors, fixed sleeps.

### Read-back
- The same `POST /api/fleet-report/run` JSON shows `unknown` counts in the per-check summary stats; unknown-only domains do not increment `domainsWithIssues`.

## Gotchas

- The report is tenant-scoped: without auth the panel shows the sign-in warning; receipt is `blocked`.
- Fleet reports never mutate providers; they read persisted findings only.
- The wire statuses are lowercase (`unknown`); the UI badge text/styling is UNKNOWN-styled.
