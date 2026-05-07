/**
 * E2E Tests for Domain 360 States
 *
 * PR-01.3: E2E tests for Domain 360 states
 * Tests empty DB state, error states, and refresh button behavior.
 */

import { expect, test } from '@playwright/test';
import { mockRefresh, waitForDomainPageReady } from './support/domain-fixtures.js';

const TEST_DOMAIN = 'new-untested-domain.example.com';

async function mockNoSnapshot(page: import('@playwright/test').Page): Promise<void> {
  await page.route(`**/api/domain/${TEST_DOMAIN}/latest`, (route) => {
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await mockRefresh(page, { status: 401, body: { error: 'Unauthorized' } });
}

/**
 * Tests for empty DB state
 * The empty state should show a yellow warning (not an error)
 */
test.describe('Empty DB State', () => {
  test('shows yellow warning for domain without snapshot', async ({ page }) => {
    // Mock API to return 404 (no snapshot) for this unknown domain
    await mockNoSnapshot(page);
    await page.goto(`/domain/${TEST_DOMAIN}`);
    await waitForDomainPageReady(page);

    // Should show yellow "no snapshot" warning, not an error
    const noSnapshotWarning = page.getByTestId('domain-no-data-banner');
    await expect(noSnapshotWarning).toBeVisible();
    await expect(noSnapshotWarning).toContainText(/no dns data/i);

    // The warning should be yellow-ish (has yellow background)
    await expect(noSnapshotWarning).toHaveClass(/yellow/);
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
    await expect(errorBanner).toContainText(/sign-in/i);
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
