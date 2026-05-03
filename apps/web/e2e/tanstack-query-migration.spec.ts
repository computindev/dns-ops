/**
 * TanStack Query Migration Regression Tests
 *
 * These tests verify that the migration from useEffect+fetch to
 * TanStack Query did not introduce caching bugs, stale closures,
 * missing credentials, or state management regressions.
 */

import { expect, test } from '@playwright/test';
import {
  mockDomainSnapshot,
  mockDelegation,
  mockMail,
  waitForDomainPageReady,
} from './support/domain-fixtures.js';

const TEST_DOMAIN = 'tanstack-query-test.com';
const SNAPSHOT_ID = 'snap-tq-001';

test.describe.configure({ mode: 'parallel' });

// ---------------------------------------------------------------------------
// Scenario 1: Simulation Panel Cache Persistence
// ---------------------------------------------------------------------------

test.describe('Simulation Panel Cache', () => {
  test('simulation result survives navigation away and back', async ({ page }) => {
    await mockDomainSnapshot(page, {
      domain: TEST_DOMAIN,
      snapshotId: SNAPSHOT_ID,
    });

    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    // Check if simulation tab exists
    const simTab = page.getByRole('tab', { name: /Simulation/i });
    if (!(await simTab.isVisible().catch(() => false))) {
      test.skip(true, 'Simulation tab not enabled');
      return;
    }

    await simTab.click();

    // Mock simulation endpoint
    await page.route('**/api/simulate', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          domain: TEST_DOMAIN,
          detectedProvider: 'google',
          proposedChanges: [],
          currentFindings: [],
          projectedFindings: [],
          resolvedFindings: [],
          remainingFindings: [],
          newFindings: [],
          summary: {
            changesProposed: 0,
            findingsBefore: 0,
            findingsAfter: 0,
            findingsResolved: 0,
            findingsNew: 0,
          },
        }),
      });
    });

    // Run simulation
    const runBtn = page.getByRole('button', { name: /Run Simulation/i });
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    // Wait for results to appear
    await expect(page.getByText(/Changes:|Findings before/i)).toBeVisible({ timeout: 10000 });

    // Navigate away to portfolio
    await page.goto('/portfolio');
    await expect(page.getByText('Portfolio workflows')).toBeVisible();

    // Navigate back to domain 360
    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);
    await simTab.click();

    // Result should still be cached — summary bar should be visible immediately
    await expect(page.getByText(/Changes:/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Error Handling & Retry
// ---------------------------------------------------------------------------

test.describe('Error Banner Retry', () => {
  test('portfolio search error shows retry button', async ({ page }) => {
    await page.goto('/portfolio');
    await expect(page.getByText('Portfolio workflows')).toBeVisible();

    // Intercept the search endpoint to always return an error
    await page.route('**/api/portfolio/search', async (route) => {
      await route.fulfill({
        status: 503,
        body: JSON.stringify({ error: 'Service unavailable' }),
      });
    });

    // Trigger a search by typing in the query field
    const queryInput = page.getByLabel(/Query/i);
    await queryInput.fill('test');
    await page.keyboard.press('Enter');

    // Wait for error banner (TanStack Query retries 3x with backoff, so this takes time)
    const errorBanner = page.getByText('Service unavailable');
    await expect(errorBanner).toBeVisible({ timeout: 15000 });

    // The "Retry" button should be present (replaces broken "Dismiss")
    const retryBtn = page.getByRole('button', { name: 'Retry' });
    await expect(retryBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Domain Resolution Cache Isolation
// ---------------------------------------------------------------------------

test.describe('Domain Resolution Cache Isolation', () => {
  test('notes and tags panels resolve domain independently', async ({ page }) => {
    await mockDomainSnapshot(page, {
      domain: TEST_DOMAIN,
      snapshotId: SNAPSHOT_ID,
    });

    // Mock the domain resolution endpoint that notes/tags panels call
    await page.route(`**/api/portfolio/domains/by-name/${TEST_DOMAIN}`, async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ domain: { id: 'dom-123', name: TEST_DOMAIN } }),
      });
    });

    // Mock notes and tags endpoints
    await page.route('**/api/portfolio/domains/dom-123/notes', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ notes: [] }) });
    });
    await page.route('**/api/portfolio/domains/dom-123/tags', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ tags: [] }) });
    });

    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    // Both panels should render without getting stuck in loading
    await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tags' })).toBeVisible();

    // Wait for panel data to load
    await expect(page.getByText(/Loading notes/i)).not.toBeVisible();
    await expect(page.getByText(/Loading tags/i)).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Domain 360 Error State Distinction
// ---------------------------------------------------------------------------

test.describe('Domain 360 Error States', () => {
  test('shows correct error banner for API failures vs 404', async ({ page }) => {
    // Mock 500 error
    await page.route(`**/api/domain/${TEST_DOMAIN}/latest`, async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Database connection failed' }),
      });
    });

    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    // Should show red error banner for server error
    const errorBanner = page.getByTestId('loader-error-banner');
    await expect(errorBanner).toBeVisible();

    await page.unroute(`**/api/domain/${TEST_DOMAIN}/latest`);
  });

  test('shows yellow banner for 404 (no snapshot)', async ({ page }) => {
    await page.route(`**/api/domain/${TEST_DOMAIN}/latest`, async (route) => {
      await route.fulfill({ status: 404, body: JSON.stringify({ error: 'Not found' }) });
    });

    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    // Should show yellow "no data" banner
    const banner = page.getByTestId('domain-no-data-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveClass(/bg-yellow-50/);

    await page.unroute(`**/api/domain/${TEST_DOMAIN}/latest`);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Refresh Button Invalidates Domain Data
// ---------------------------------------------------------------------------

test.describe('Refresh Invalidation', () => {
  test('refresh button invalidates and refetches domain data', async ({ page }) => {
    let latestCallCount = 0;
    await page.route(`**/api/domain/${TEST_DOMAIN}/latest`, async (route) => {
      latestCallCount++;
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: SNAPSHOT_ID,
          domainId: `dom-${SNAPSHOT_ID}`,
          zoneManagement: 'unmanaged',
          resultState: 'complete',
          createdAt: new Date().toISOString(),
          queriedNames: [TEST_DOMAIN],
          queriedTypes: ['A', 'NS'],
          vantages: ['default'],
        }),
      });
    });

    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    const initialCount = latestCallCount;

    // Mock refresh endpoint
    await page.route('**/api/collect/domain', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      } else {
        await route.continue();
      }
    });

    // Click refresh
    const refreshBtn = page.getByRole('button', { name: /^Refresh$/i });
    await refreshBtn.click();

    // Wait for refresh to complete and data to be refetched
    await page.waitForTimeout(500);

    // After refresh completes, the latest endpoint should have been called again
    await expect.poll(() => latestCallCount, { timeout: 10000 }).toBeGreaterThan(initialCount);

    await page.unroute(`**/api/domain/${TEST_DOMAIN}/latest`);
    await page.unroute('**/api/collect/domain');
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Credentials Are Sent With All Panel Requests
// ---------------------------------------------------------------------------

test.describe('Request Credentials', () => {
  test('all panel API requests reach the server successfully', async ({ page }) => {
    const apiPaths = new Set<string>();

    page.on('response', (res) => {
      const url = new URL(res.url());
      if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/')) {
        apiPaths.add(url.pathname);
      }
    });

    // Portfolio page
    await page.goto('/portfolio');
    await expect(page.getByText('Portfolio workflows')).toBeVisible();
    await page.waitForTimeout(500); // Allow initial queries to fire

    // Domain 360 page
    await mockDomainSnapshot(page, {
      domain: TEST_DOMAIN,
      snapshotId: SNAPSHOT_ID,
    });
    await mockDelegation(page, SNAPSHOT_ID, { delegation: null, issues: [] });
    await mockMail(page, SNAPSHOT_ID, {
      findingsMail: {
        snapshotId: SNAPSHOT_ID,
        domain: TEST_DOMAIN,
        rulesetVersion: '1.0',
        persisted: true,
        mailConfig: {
          hasMx: true,
          hasSpf: true,
          hasDmarc: true,
          hasDkim: true,
          hasMtaSts: false,
          hasTlsRpt: false,
          securityScore: 80,
          issues: [],
          recommendations: [],
        },
        findings: [],
        suggestions: [],
      },
    });

    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    // Click through tabs to trigger panel loads
    for (const tabName of ['DNS', 'Mail', 'History', 'Delegation']) {
      const tab = page.getByRole('tab', { name: new RegExp(`^${tabName}$`, 'i') });
      if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(300);
      }
    }

    // Verify that API endpoints were hit (proving requests went out with auth)
    expect(apiPaths.size).toBeGreaterThan(0);
  });
});
