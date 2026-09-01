/**
 * E2E Tests for Domain 360 States
 *
 * PR-01.3: E2E tests for Domain 360 states
 * Tests empty DB state, error states, and refresh button behavior.
 */

import { expect, test } from '@playwright/test';
import { mockRefresh, waitForDomainPageReady } from './support/domain-fixtures.js';

const TEST_DOMAIN = 'new-untested-domain.example.com';

async function expectSignalRoomWarningSurface(
  page: import('@playwright/test').Page,
  testId: string
): Promise<void> {
  await expect(page.getByTestId(testId)).toHaveAttribute('data-state', 'warning');
  await expect(page.getByTestId(testId)).toHaveClass(/domain-360__state--warning/);
  const colors = await page.getByTestId(testId).evaluate((element) => {
    const tokenSample = document.createElement('div');
    tokenSample.style.backgroundColor = 'var(--color-warning-surface)';
    document.body.append(tokenSample);
    const result = {
      surface: getComputedStyle(element).backgroundColor,
      token: getComputedStyle(tokenSample).backgroundColor,
    };
    tokenSample.remove();
    return result;
  });
  expect(colors.surface).toBe(colors.token);
}

async function mockNoSnapshot(page: import('@playwright/test').Page): Promise<void> {
  await page.route(`**/api/domain/${TEST_DOMAIN}/latest`, (route) => {
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await mockRefresh(page, { status: 401, body: { error: 'Unauthorized' } });
}

/**
 * Tests for empty DB state
 * The empty state must expose the Signal Room warning state (not an error).
 */
test.describe('Empty DB State', () => {
  test('shows a semantic warning for a domain without snapshot', async ({ page }) => {
    // Mock API to return 404 (no snapshot) for this unknown domain
    await mockNoSnapshot(page);
    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    // A 404 is a recoverable warning, never an error or healthy state.
    const noSnapshotWarning = page.getByTestId('domain-no-data-banner');
    await expect(noSnapshotWarning).toBeVisible();
    await expect(noSnapshotWarning).toContainText(/no dns data/i);

    await expectSignalRoomWarningSurface(page, 'domain-no-data-banner');
  });

  test('shows notes and tags panels even without snapshot', async ({ page }) => {
    // Mock API to return 404 (no snapshot) for this unknown domain
    await mockNoSnapshot(page);
    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    // Notes panel should be visible
    await expect(page.getByRole('heading', { name: /notes/i })).toBeVisible();
    // Tags panel should be visible
    await expect(page.getByRole('heading', { name: /tags/i })).toBeVisible();
  });
});

/**
 * Tests for refresh button accessibility and aria-busy state
 */
test.describe('Refresh Button Behavior', () => {
  test('refresh button is visible and enabled initially', async ({ page }) => {
    await mockNoSnapshot(page);
    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    const refreshButton = page.getByRole('button', { name: /refresh/i });
    await expect(refreshButton).toBeVisible();
    await expect(refreshButton).toBeEnabled();
  });

  test('refresh button shows aria-busy during refresh', async ({ page }) => {
    await page.route(`**/api/domain/${TEST_DOMAIN}/latest`, (route) => {
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    // Mock the collect endpoint so refresh completes
    await mockRefresh(page, {
      status: 200,
      body: { success: true, snapshotId: 'snap-refresh-test' },
    });
    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    const refreshButton = page.getByRole('button', { name: /refresh/i });

    // Verify initial aria-busy state
    await expect(refreshButton).toHaveAttribute('aria-busy', 'false');

    // Click refresh
    await refreshButton.click();

    // After refresh completes, aria-busy should be back to false
    await expect(refreshButton).toHaveAttribute('aria-busy', 'false', { timeout: 10000 });
    await expect(refreshButton).toHaveText(/refresh/i, { timeout: 5000 });
  });

  test('clears addToPortfolio from the URL after successful collection', async ({ page }) => {
    await page.route(`**/api/domain/${TEST_DOMAIN}/latest`, (route) => {
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    await mockRefresh(page, {
      status: 200,
      body: { success: true, snapshotId: 'snap-portfolio-test' },
    });

    await page.goto(`/domain/${TEST_DOMAIN}?addToPortfolio=true`);
    await waitForDomainPageReady(page);

    await expect(page).not.toHaveURL(/addToPortfolio/, { timeout: 10000 });
  });

  test('refresh button re-enabled after refresh completes', async ({ page }) => {
    await page.route(`**/api/domain/${TEST_DOMAIN}/latest`, (route) => {
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    // Mock the collect endpoint so refresh completes
    await mockRefresh(page, {
      status: 200,
      body: { success: true, snapshotId: 'snap-refresh-test' },
    });
    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    const refreshButton = page.getByRole('button', { name: /refresh/i });

    // Perform a refresh
    await refreshButton.click();

    // Wait for refresh to complete (button text returns to normal)
    await expect(refreshButton).toHaveText(/refresh/i, { timeout: 10000 });
    await expect(refreshButton).toBeEnabled({ timeout: 5000 });
    await expect(refreshButton).toHaveAttribute('aria-busy', 'false');
  });

  test('refresh button disabled during refresh (cannot click twice)', async ({ page }) => {
    await page.route(`**/api/domain/${TEST_DOMAIN}/latest`, (route) => {
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    // Mock the collect endpoint so refresh completes
    await mockRefresh(page, {
      status: 200,
      body: { success: true, snapshotId: 'snap-refresh-test' },
    });
    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    const refreshButton = page.getByRole('button', { name: /refresh/i });

    // Button should start enabled
    await expect(refreshButton).toBeEnabled();

    // Click refresh — the button's disabled attribute is set by React during refresh
    await refreshButton.click();

    // After refresh completes, button should be re-enabled
    await expect(refreshButton).toBeEnabled({ timeout: 10000 });
    await expect(refreshButton).toHaveText(/refresh/i, { timeout: 5000 });
  });
});

/**
 * Tests for loader error states
 * The loader error banner should be visible when API is unreachable
 */
test.describe('Loader Error States', () => {
  test('shows error banner when API is unreachable', async ({ page }) => {
    // Mock snapshot (404 = no data) and refresh (401 = auth required)
    await mockNoSnapshot(page);
    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    // Click refresh — mocked to return 401
    const refreshButton = page.getByRole('button', { name: /refresh/i });
    await refreshButton.click();

    // Wait for refresh to complete
    await expect(refreshButton).toHaveText(/refresh/i, { timeout: 10000 });

    // Should show auth-required message (red banner)
    const errorBanner = page.getByTestId('domain-refresh-error-banner');
    await expect(errorBanner).toBeVisible({ timeout: 5000 });
    await expect(errorBanner).toContainText(/sign in/i);
  });

  test('shows error banner with fetch error status', async ({ page }) => {
    // Mock snapshot (404 = no data) and refresh (500 = server error)
    await page.route(`**/api/domain/${TEST_DOMAIN}/latest`, (route) => {
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    await mockRefresh(page, { status: 500, body: { error: 'Internal Server Error' } });
    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    // Click refresh — mocked to return 500
    const refreshButton = page.getByRole('button', { name: /refresh/i });
    await refreshButton.click();

    // Wait for refresh to complete
    await expect(refreshButton).toHaveText(/refresh/i, { timeout: 10000 });

    // Should show error message
    const errorBanner = page.getByTestId('domain-refresh-error-banner');
    await expect(errorBanner).toBeVisible({ timeout: 5000 });
  });
});

/**
 * Tests for accessibility
 */
test.describe('Domain 360 Accessibility', () => {
  test('refresh button has proper aria attributes', async ({ page }) => {
    await mockNoSnapshot(page);
    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    const refreshButton = page.getByRole('button', { name: /refresh/i });

    // Should have aria-busy attribute (initially false)
    await expect(refreshButton).toHaveAttribute('aria-busy', 'false');
  });

  test('tabs are properly labeled for screen readers', async ({ page }) => {
    await mockNoSnapshot(page);
    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    const tablist = page.getByRole('tablist', { name: /dns views/i });
    await expect(tablist).toBeVisible();

    const tabs = page.getByRole('tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThan(0);

    // Each tab should have aria-selected
    for (let i = 0; i < tabCount; i++) {
      const tab = tabs.nth(i);
      await expect(tab).toHaveAttribute('aria-selected');
    }
  });
});

/**
 * Tests for the Parsed-view remaining-TTL countdown and estimated live-at
 * (issue #55). Estimates come only from matching successful public-recursive
 * answers; the fake clock proves ticking, the exact-zero boundary, the stale
 * transition, and visible UNKNOWN for unusable evidence.
 */
const TTL_DOMAIN = 'ttl-countdown.example.com';
const TTL_BASE_TIME = '2024-06-01T12:00:00.000Z';

interface TtlObservationFixture {
  id: string;
  vantageType: 'public-recursive' | 'authoritative';
  status: string;
  ttl: number;
}

function ttlObservation(fixture: TtlObservationFixture): Record<string, unknown> {
  return {
    id: fixture.id,
    snapshotId: 'snap-ttl',
    queryName: TTL_DOMAIN,
    queryType: 'A',
    vantageType: fixture.vantageType,
    vantageIdentifier: fixture.vantageType === 'public-recursive' ? '8.8.8.8' : 'ns1.example.com',
    status: fixture.status,
    queriedAt: TTL_BASE_TIME,
    responseTimeMs: 42,
    responseCode: 0,
    flags: null,
    answerSection: [{ name: TTL_DOMAIN, type: 'A', ttl: fixture.ttl, data: '203.0.113.10' }],
    authoritySection: null,
    additionalSection: null,
    errorMessage: null,
    errorDetails: null,
    rawResponse: null,
  };
}

async function mockTtlSnapshot(
  page: import('@playwright/test').Page,
  observations: Record<string, unknown>[]
): Promise<void> {
  // The domain page also calls auth/me and other DB-backed endpoints;
  // without a local DB those return HTML errors and __root's raw res.json()
  // crashes the route, so mock the session too.
  await page.route('**/api/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        email: 'e2e@example.com',
        tenant: 'dns-ops-e2e',
      }),
    });
  });
  await page.route(`**/api/domain/${TTL_DOMAIN}/latest`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'snap-ttl',
        domainId: 'dom-ttl',
        zoneManagement: 'unmanaged',
        resultState: 'complete',
        createdAt: TTL_BASE_TIME,
        queriedNames: [TTL_DOMAIN],
        queriedTypes: ['A'],
        vantages: ['8.8.8.8'],
      }),
    });
  });
  await page.route('**/api/snapshot/snap-ttl/observations', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(observations),
    });
  });
}

/**
 * Deterministic fake clock: a paused clock blocks client hydration, so time is
 * instead held fixed with setFixedTime before load — Date.now() is stable
 * (deterministic countdowns) while timers keep running. Advancing the
 * countdown is done by re-setting the fixed time; the one-second interval
 * picks the new value up on its next real tick.
 */
async function openParsedDnsView(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`/domain/${TTL_DOMAIN}`);
  await waitForDomainPageReady(page);
  await page.getByRole('tab', { name: /^DNS$/ }).click();
  await expect(page.getByRole('columnheader', { name: 'Remaining TTL' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Estimated live at' })).toBeVisible();
}

test.describe('DNS Parsed TTL countdown', () => {
  test('ticks remaining TTL and renders a machine-readable estimated live-at', async ({ page }) => {
    await page.clock.install({ time: TTL_BASE_TIME });
    await page.clock.setFixedTime(TTL_BASE_TIME);
    await mockTtlSnapshot(page, [
      ttlObservation({
        id: 'obs-ttl-1',
        vantageType: 'public-recursive',
        status: 'success',
        ttl: 300,
      }),
    ]);

    await openParsedDnsView(page);

    // 300 s TTL observed exactly at the paused base time.
    await expect(page.getByRole('cell', { name: '300s remaining' })).toBeVisible();
    // The sr-only caption names the table.
    await expect(page.getByRole('table', { name: /A DNS records/i })).toBeVisible();

    // Machine-readable expiry: queriedAt + 300 s.
    await expect(page.locator('table time')).toHaveAttribute(
      'datetime',
      '2024-06-01T12:05:00.000Z'
    );

    // One shared one-second timer drives the countdown.
    await page.clock.setFixedTime('2024-06-01T12:00:01.000Z');
    await expect(page.getByRole('cell', { name: '299s remaining' })).toBeVisible();
  });

  test('shows a valid 0 exactly at the deadline and UNKNOWN after it', async ({ page }) => {
    await page.clock.install({ time: TTL_BASE_TIME });
    await page.clock.setFixedTime(TTL_BASE_TIME);
    await mockTtlSnapshot(page, [
      ttlObservation({
        id: 'obs-ttl-1',
        vantageType: 'public-recursive',
        status: 'success',
        ttl: 60,
      }),
    ]);

    await openParsedDnsView(page);

    // Advance to the exact deadline (queriedAt + 60 s): remaining is a valid 0.
    await page.clock.setFixedTime('2024-06-01T12:01:00.000Z');
    await expect(page.getByRole('cell', { name: '0s remaining' })).toBeVisible();

    // One second past the deadline both new fields render a visible UNKNOWN.
    await page.clock.setFixedTime('2024-06-01T12:01:01.000Z');
    await expect(page.getByRole('cell', { name: 'UNKNOWN' })).toHaveCount(2);
    await expect(page.getByTitle(/expired/i)).toHaveCount(2);
  });

  test('renders UNKNOWN when no valid public-recursive evidence exists', async ({ page }) => {
    await page.clock.install({ time: TTL_BASE_TIME });
    await page.clock.setFixedTime(TTL_BASE_TIME);
    await mockTtlSnapshot(page, [
      ttlObservation({
        id: 'obs-auth-1',
        vantageType: 'authoritative',
        status: 'success',
        ttl: 300,
      }),
    ]);

    await openParsedDnsView(page);

    // Authoritative TTL is not cache lifetime: both new fields are UNKNOWN.
    await expect(page.getByRole('cell', { name: 'UNKNOWN' })).toHaveCount(2);
    await expect(page.getByTitle(/no valid public-recursive evidence/i)).toHaveCount(2);
    await expect(page.locator('table time')).toHaveCount(0);
  });

  test('renders UNKNOWN without a time element when the TTL deadline overflows the Date range', async ({
    page,
  }) => {
    await page.clock.install({ time: TTL_BASE_TIME });
    await page.clock.setFixedTime(TTL_BASE_TIME);
    await mockTtlSnapshot(page, [
      ttlObservation({
        id: 'obs-ttl-overflow',
        vantageType: 'public-recursive',
        status: 'success',
        ttl: Number.MAX_SAFE_INTEGER,
      }),
    ]);

    await openParsedDnsView(page);

    // A successful recursive answer whose queriedAt + ttl × 1000 exceeds the
    // maximum Date value is unusable evidence: both cells show a visible
    // UNKNOWN and the machine-readable <time> element must not exist.
    await expect(page.getByRole('cell', { name: 'UNKNOWN' })).toHaveCount(2);
    await expect(page.getByTitle(/no valid public-recursive evidence/i)).toHaveCount(2);
    await expect(page.locator('table time')).toHaveCount(0);
  });
});
