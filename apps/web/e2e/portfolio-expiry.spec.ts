import { expect, type Page, test } from '@playwright/test';

/**
 * Issue #60 e2e: expiry column, expiry window selector, and saved-filter
 * round-trip on the Portfolio Search panel.
 */

const OBSERVED_EXPIRY_ISO = '2026-12-15T00:00:00.000Z';

function portfolioDomains() {
  return [
    {
      id: 'domain-expiring',
      name: 'expiring.example.test',
      normalizedName: 'expiring.example.test',
      zoneManagement: 'managed',
      findings: [],
      findingsEvaluated: true,
      evaluationCoverage: { state: 'COMPLETE', errors: [] },
      latestSnapshot: {
        id: 'snap-1',
        createdAt: '2026-08-01T00:00:00.000Z',
        resultState: 'complete',
        rulesetVersionId: 'ruleset-v1',
      },
      expiration: {
        status: 'OBSERVED',
        expirationDate: OBSERVED_EXPIRY_ISO,
        observedAt: '2026-08-01T00:00:00.000Z',
        bucket: 'WITHIN_90',
      },
    },
    {
      id: 'domain-unknown',
      name: 'unknown-expiry.example.test',
      normalizedName: 'unknown-expiry.example.test',
      zoneManagement: 'managed',
      findings: [],
      findingsEvaluated: true,
      evaluationCoverage: { state: 'COMPLETE', errors: [] },
      latestSnapshot: {
        id: 'snap-2',
        createdAt: '2026-08-01T00:00:00.000Z',
        resultState: 'complete',
        rulesetVersionId: 'ruleset-v1',
      },
      expiration: { status: 'UNKNOWN' },
    },
  ];
}

async function mockPortfolioWorkspace(page: Page): Promise<void> {
  await page.route('**/api/portfolio/tags', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tags: [] }) })
  );
  await page.route('**/api/portfolio/search', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ domains: portfolioDomains() }),
    })
  );
  await page.route('**/api/portfolio/filters', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ filters: [] }) })
  );
  await page.route('**/api/monitoring/domains', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ monitoredDomains: [] }),
    })
  );
  await page.route('**/api/portfolio/audit?*', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ events: [] }) })
  );
  await page.route('**/api/alerts**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        alerts: [],
        pagination: { total: 0, offset: 0, hasMore: false },
      }),
    })
  );
}

test.describe('Portfolio expiry radar', () => {
  test('renders the Expiry column with the bucket or literal UNKNOWN', async ({ page }) => {
    await mockPortfolioWorkspace(page);
    await page.goto('/portfolio');

    await expect(page.getByRole('heading', { name: /portfolio workflows/i })).toBeVisible();

    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Expiry' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Domain' })).toBeVisible();

    const expiringRow = table.getByRole('row', { name: /expiring\.example\.test/ });
    await expect(expiringRow.getByText('WITHIN_90')).toBeVisible();

    const unknownRow = table.getByRole('row', { name: /unknown-expiry\.example\.test/ });
    await expect(unknownRow.getByRole('cell', { name: 'UNKNOWN', exact: true })).toBeVisible();
  });

  test('sends expirationWithinDays when an expiry window is selected', async ({ page }) => {
    await mockPortfolioWorkspace(page);
    await page.goto('/portfolio');

    const expiryWindow = page.getByLabel('Expiry window');
    await expect(expiryWindow).toBeVisible();
    await expect(expiryWindow).toHaveValue('');
    await expect(page.getByRole('table')).toBeVisible();

    const request = page.waitForRequest(
      (candidate) =>
        candidate.url().endsWith('/api/portfolio/search') &&
        candidate.method() === 'POST' &&
        (candidate.postDataJSON() as Record<string, unknown>).expirationWithinDays === 90
    );
    await expiryWindow.selectOption('90');
    const captured = await request;
    expect(captured).toBeDefined();
    await expect(expiryWindow).toHaveValue('90');
  });

  test('loads a saved 90-day expiry filter and searches with it', async ({ page }) => {
    await mockPortfolioWorkspace(page);
    await page.route('**/api/portfolio/filters', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          filters: [
            {
              id: 'filter-expiring-90',
              name: 'Expiring within 90 days',
              description: 'Saved expiry radar filter',
              criteria: { expirationWithinDays: 90 },
              isShared: false,
              createdBy: 'e2e-bot',
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
              canManage: true,
            },
          ],
        }),
      })
    );

    await page.goto('/portfolio');

    await expect(page.getByText('Expiring within 90 days')).toBeVisible();

    const request = page.waitForRequest(
      (candidate) =>
        candidate.url().endsWith('/api/portfolio/search') &&
        candidate.method() === 'POST' &&
        (candidate.postDataJSON() as Record<string, unknown>).expirationWithinDays === 90
    );
    await page.getByRole('button', { name: 'Load filter' }).click();
    await request;
    await expect(page.getByLabel('Expiry window')).toHaveValue('90');
  });
});
