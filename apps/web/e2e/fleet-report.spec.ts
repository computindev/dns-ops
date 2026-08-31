/**
 * Fleet Reports Panel E2E — issue #65 truth model
 *
 * The fleet report UI must never render a clean/success verdict for a check
 * without affirmative persisted evidence: stale, partial or uncorrelated
 * evidence renders UNKNOWN. API responses are intercepted (same pattern as
 * delegation-panel.spec.ts) so the drive is deterministic and needs no
 * database.
 */

import { expect, test } from '@playwright/test';

function fleetReportResponse(results: Array<Record<string, unknown>>) {
  return {
    reportGeneratedAt: new Date().toISOString(),
    domainsChecked: results.length,
    domainsWithErrors: 0,
    backedByPersistedFindings: true,
    summary: {
      totalDomains: results.length,
      domainsWithIssues: 0,
      spfStats: { pass: 0, fail: 0, warning: 0, missing: 0, unknown: results.length },
    },
    results,
    highPriorityIssues: [],
  };
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/fleet-report/run', (route) => {
    const body = route.request().postDataJSON() as { inventory: string[] };
    const results = body.inventory.map((domain) => ({
      domain,
      snapshotId: `snap-${domain}`,
      collectedAt: new Date().toISOString(),
      rulesetVersion: 'v1',
      findingsCount: 0,
      checks: [
        {
          check: 'spf',
          status: 'unknown',
          severity: 'ok',
          message: `No SPF evidence persisted for ${domain}`,
        },
      ],
      issues: [],
    }));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fleetReportResponse(results)),
    });
  });
});

test('renders UNKNOWN, not a success badge, for checks without evidence', async ({ page }) => {
  await page.goto('/portfolio');
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { name: /fleet reports/i }).waitFor({ timeout: 15_000 });

  await page.getByRole('button', { name: /mail security baseline/i }).click();
  await page.getByLabel(/domain inventory/i).fill('stale.example');
  await page.getByRole('button', { name: /run report/i }).click();

  await page.getByRole('button', { name: /show domain details/i }).click();
  await page.getByRole('button', { name: /show checks/i }).click();

  // UNKNOWN must surface: the no-evidence message renders and its badge carries
  // the 'unknown' title, never 'pass'. Styling distinctness is asserted in
  // FleetReportsPanel.test.ts (statusBadge) and the live badge dump.
  await expect(page.getByText('No SPF evidence persisted for stale.example')).toBeVisible();
  await expect(page.getByTitle('unknown')).toBeVisible();
});

test('keeps affirmative pass badges distinct from unknown', async ({ page }) => {
  await page.route('**/api/fleet-report/run', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reportGeneratedAt: new Date().toISOString(),
        domainsChecked: 1,
        domainsWithErrors: 0,
        backedByPersistedFindings: true,
        summary: {
          totalDomains: 1,
          domainsWithIssues: 0,
          spfStats: { pass: 1, fail: 0, warning: 0, missing: 0, unknown: 0 },
        },
        results: [
          {
            domain: 'clean.example',
            snapshotId: 'snap-clean',
            collectedAt: new Date().toISOString(),
            rulesetVersion: 'v1',
            findingsCount: 1,
            checks: [
              {
                check: 'spf',
                status: 'pass',
                severity: 'ok',
                message: 'SPF present (seeded evidence)',
              },
            ],
            issues: [],
          },
        ],
        highPriorityIssues: [],
      }),
    })
  );

  await page.goto('/portfolio');
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { name: /fleet reports/i }).waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: /mail security baseline/i }).click();
  await page.getByLabel(/domain inventory/i).fill('clean.example');
  await page.getByRole('button', { name: /run report/i }).click();

  await page.getByRole('button', { name: /show domain details/i }).click();
  await page.getByRole('button', { name: /show checks/i }).click();
  await expect(page.getByText('SPF present (seeded evidence)')).toBeVisible();
  await expect(page.getByTitle('pass')).toBeVisible();
});
