import { expect, test } from '@playwright/test';

async function mockPortfolioWorkspace(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/portfolio/tags', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tags: ['priority'] }) })
  );
  await page.route('**/api/portfolio/search', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        domains: [
          {
            id: 'domain-1',
            name: 'portfolio-signal.example.test',
            normalizedName: 'portfolio-signal.example.test',
            zoneManagement: 'managed',
            findings: [],
            findingsEvaluated: false,
            evaluationCoverage: {
              state: 'PARTIAL',
              errors: [
                {
                  unknown: {
                    explanation: 'The latest evaluation is incomplete.',
                    actionLabel: 'Run a fresh scan',
                  },
                },
              ],
            },
            latestSnapshot: null,
          },
        ],
      }),
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
  await page.route('**/api/alerts**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/alerts') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          alerts: [
            {
              id: 'alert-1',
              monitoredDomainId: 'domain-1',
              title: 'TLS evidence needs review',
              description: 'The latest collector response needs operator review.',
              severity: 'critical',
              status: 'pending',
              createdAt: '2026-08-08T12:00:00.000Z',
            },
          ],
          pagination: { total: 1, offset: 0, hasMore: false },
        }),
      });
      return;
    }
    if (pathname.endsWith('/resolve') || pathname.endsWith('/acknowledge')) {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ reports: [] }) });
  });
}

test.describe('Portfolio Signal Room', () => {
  test('uses semantic panels, inputs, and evidence tones while retaining operator actions', async ({
    page,
  }) => {
    await mockPortfolioWorkspace(page);
    await page.goto('/portfolio');

    const workspace = page.locator('.portfolio-workspace');
    await expect(workspace).toBeVisible();
    await expect(workspace.locator('.portfolio-panel')).toHaveCount(8);
    await expect(page.getByRole('heading', { name: 'Portfolio workflows' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Portfolio Search' }).locator('xpath=../..')
    ).toHaveClass(/ds-panel/);
    await expect(page.getByPlaceholder('example.com').first()).toHaveClass(/ds-input/);
    await expect(page.getByText('Needs setup/evidence.')).toHaveClass(/ds-badge--unknown/);
    const alertsPanel = page
      .locator('.portfolio-panel')
      .filter({ has: page.getByRole('heading', { name: 'Alerts', exact: true }) });
    await expect(alertsPanel.getByText('critical', { exact: true })).toHaveClass(
      /ds-badge--danger/
    );
    await expect(alertsPanel.getByText('pending', { exact: true })).toHaveClass(/ds-badge--danger/);

    await alertsPanel.getByRole('button', { name: 'Resolve', exact: true }).click();
    await page
      .getByPlaceholder('Describe how this alert was resolved')
      .fill('Fresh evidence requested');
    const request = page.waitForRequest(
      (candidate) =>
        candidate.url().endsWith('/api/alerts/alert-1/resolve') && candidate.method() === 'POST'
    );
    await page.getByRole('button', { name: 'Confirm Resolve' }).click();
    await request;
  });

  test('keeps the complete workspace within the viewport at supported widths', async ({ page }) => {
    await mockPortfolioWorkspace(page);
    await page.goto('/portfolio');
    await expect(page.locator('.portfolio-panel')).toHaveCount(8);

    for (const width of [320, 375, 414, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
          )
        )
        .toBe(true);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const controls = document.querySelectorAll(
              '.portfolio-workspace > .ds-panel .ds-button, .portfolio-panel .ds-button'
            );
            return [...controls].every((control) => {
              const range = document.createRange();
              range.selectNodeContents(control);
              return range.getClientRects().length <= 1;
            });
          })
        )
        .toBe(true);
    }
  });
});
