/**
 * DiscoveredSelectors E2E Tests
 *
 * PR-02.4: Component test for DiscoveredSelectors with different provenance values
 * Verify each renders with visually distinct label/badge.
 */

import { expect, test } from '@playwright/test';
import { mockDomainSnapshot, mockMail } from './support/domain-fixtures.js';

const TEST_DOMAIN = 'google.com';
const SNAPSHOT_ID_PREVIEW = 'snap-preview-test';
const SNAPSHOT_ID_SELECTORS = 'snap-e2e-test';

// Shared mail findings fixture
function mailFindingsPayload(snapshotId: string) {
  return {
    snapshotId,
    domain: TEST_DOMAIN,
    rulesetVersion: '1.0.0',
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
  };
}

test.describe('Mail tab renders native analysis (no preview badge)', () => {
  test('should NOT show preview badge or legacy disclaimer', async ({ page }) => {
    await mockDomainSnapshot(page, {
      domain: TEST_DOMAIN,
      snapshotId: SNAPSHOT_ID_PREVIEW,
      queriedTypes: ['A', 'MX', 'TXT'],
    });
    await mockMail(page, SNAPSHOT_ID_PREVIEW, {
      findingsMail: mailFindingsPayload(SNAPSHOT_ID_PREVIEW),
      selectors: { selectors: [] },
    });

    await page.goto(`/domain/${TEST_DOMAIN}?tab=mail`);
    const mailTab = page.getByRole('tab', { name: /mail/i });
    await expect(mailTab).toHaveAttribute('aria-selected', 'true', { timeout: 10000 });
    // Wait for mail content to render
    await page
      .getByRole('heading', { name: /mail security analysis/i })
      .waitFor({ state: 'visible', timeout: 15000 });

    // Preview badge and legacy disclaimer must NOT be present
    await expect(page.getByTestId('mail-preview-badge')).toHaveCount(0);
    await expect(page.getByTestId('mail-preview-disclaimer')).toHaveCount(0);
  });
});

test.describe('DiscoveredSelectors Component', () => {
  test.describe.configure({ mode: 'serial' });

  // Helper: set up snapshot + mail + selectors mocks and navigate to mail tab
  async function setupSelectorsTest(page: import('@playwright/test').Page, selectors: unknown[]) {
    await mockDomainSnapshot(page, {
      domain: TEST_DOMAIN,
      snapshotId: SNAPSHOT_ID_SELECTORS,
      queriedTypes: ['A', 'MX', 'TXT'],
    });
    await mockMail(page, SNAPSHOT_ID_SELECTORS, {
      findingsMail: mailFindingsPayload(SNAPSHOT_ID_SELECTORS),
      selectors: { selectors },
    });
    await page.goto(`/domain/${TEST_DOMAIN}?tab=mail`);
    // Verify the mail tab is selected
    const mailTab = page.getByRole('tab', { name: /mail/i });
    await expect(mailTab).toHaveAttribute('aria-selected', 'true', { timeout: 10000 });
    // Wait for mail tab content to render
    await page
      .getByRole('heading', { name: /dkim selectors/i })
      .waitFor({ state: 'visible', timeout: 15000 });
  }

  test.describe('Confidence Badge Rendering', () => {
    test('should render certain confidence with green badge', async ({ page }) => {
      await setupSelectorsTest(page, [
        {
          selector: 'google',
          found: true,
          provenance: 'managed-zone-config',
          confidence: 'certain',
        },
      ]);

      // The confidence badge span has green classes directly
      const certainBadge = page.locator('span:text-is("certain")').first();
      await expect(certainBadge).toBeVisible();
      const classes = await certainBadge.getAttribute('class');
      expect(classes).toContain('green');
    });

    test('should render high confidence with blue badge', async ({ page }) => {
      await setupSelectorsTest(page, [
        {
          selector: 'operator1',
          found: true,
          provenance: 'operator-supplied',
          confidence: 'high',
        },
      ]);

      const highBadge = page.locator('span:text-is("high")').first();
      await expect(highBadge).toBeVisible();
      const classes = await highBadge.getAttribute('class');
      expect(classes).toContain('blue');
    });

    test('should render medium confidence with yellow badge', async ({ page }) => {
      await setupSelectorsTest(page, [
        {
          selector: 'google',
          found: true,
          provenance: 'provider-heuristic',
          confidence: 'medium',
          provider: 'google-workspace',
        },
      ]);

      const mediumBadge = page.locator('span:text-is("medium")').first();
      await expect(mediumBadge).toBeVisible();
      const classes = await mediumBadge.getAttribute('class');
      expect(classes).toContain('yellow');
    });

    test('should render low confidence with orange badge', async ({ page }) => {
      await setupSelectorsTest(page, [
        {
          selector: 'default',
          found: false,
          provenance: 'common-dictionary',
          confidence: 'low',
        },
      ]);

      const lowBadge = page.locator('span:text-is("low")').first();
      await expect(lowBadge).toBeVisible();
      const classes = await lowBadge.getAttribute('class');
      expect(classes).toContain('orange');
    });

    test('should render heuristic confidence with gray badge', async ({ page }) => {
      await setupSelectorsTest(page, [
        {
          selector: 'selector1',
          found: false,
          provenance: 'not-found',
          confidence: 'heuristic',
        },
      ]);

      const heuristicBadge = page.locator('span:text-is("heuristic")').first();
      await expect(heuristicBadge).toBeVisible();
      const classes = await heuristicBadge.getAttribute('class');
      expect(classes).toContain('gray');
    });
  });

  test.describe('Provenance Label Formatting', () => {
    test('should format managed-zone-config provenance', async ({ page }) => {
      await setupSelectorsTest(page, [
        {
          selector: 'configured',
          found: true,
          provenance: 'managed-zone-config',
          confidence: 'certain',
        },
      ]);

      await expect(page.locator('text=/managed zone configuration/i').first()).toBeVisible();
    });

    test('should format operator-supplied provenance', async ({ page }) => {
      await setupSelectorsTest(page, [
        {
          selector: 'operator1',
          found: true,
          provenance: 'operator-supplied',
          confidence: 'high',
        },
      ]);

      await expect(page.locator('text=/operator supplied/i').first()).toBeVisible();
    });

    test('should format provider-heuristic provenance', async ({ page }) => {
      await setupSelectorsTest(page, [
        {
          selector: 'google',
          found: true,
          provenance: 'provider-heuristic',
          confidence: 'medium',
          provider: 'google-workspace',
        },
      ]);

      await expect(page.locator('text=/provider heuristic detection/i').first()).toBeVisible();
    });

    test('should format common-dictionary provenance', async ({ page }) => {
      await setupSelectorsTest(page, [
        {
          selector: 'selector1',
          found: false,
          provenance: 'common-dictionary',
          confidence: 'low',
        },
      ]);

      await expect(page.locator('text=/common selector dictionary/i').first()).toBeVisible();
    });

    test('should format not-found provenance', async ({ page }) => {
      await setupSelectorsTest(page, [
        {
          selector: 'unknown',
          found: false,
          provenance: 'not-found',
          confidence: 'heuristic',
        },
      ]);

      await expect(page.locator('text=/not found/i').first()).toBeVisible();
    });
  });

  test.describe('Found vs Not Found States', () => {
    test('should render found selector with green styling', async ({ page }) => {
      await setupSelectorsTest(page, [
        {
          selector: 'google',
          found: true,
          provenance: 'managed-zone-config',
          confidence: 'certain',
        },
      ]);

      // The selector card has p-3 + rounded-lg + border; narrower than outer panel
      const selectorCard = page
        .locator('div.p-3.rounded-lg.border')
        .filter({ has: page.locator('code:text("google._domainkey")') })
        .first();
      const classes = await selectorCard.getAttribute('class');
      expect(classes).toContain('green');
    });

    test('should render not-found selector with gray styling', async ({ page }) => {
      await setupSelectorsTest(page, [
        {
          selector: 'unknown',
          found: false,
          provenance: 'not-found',
          confidence: 'heuristic',
        },
      ]);

      // The selector card has p-3 + rounded-lg + border; narrower than outer panel
      const selectorCard = page
        .locator('div.p-3.rounded-lg.border')
        .filter({ has: page.locator('code:text("unknown._domainkey")') })
        .first();
      const classes = await selectorCard.getAttribute('class');
      expect(classes).toContain('gray');
    });
  });

  test.describe('Empty State', () => {
    test('should render empty state when no selectors', async ({ page }) => {
      await setupSelectorsTest(page, []);

      await expect(page.locator('text=/no dkim selectors discovered/i').first()).toBeVisible();
    });
  });
});
