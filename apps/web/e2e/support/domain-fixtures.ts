/**
 * E2E Route Mocking Helpers
 *
 * Register all Playwright route interceptors BEFORE navigation
 * to avoid hydration race conditions. TanStack Start's SSR loader
 * returns null, then client-side router.invalidate() triggers a refetch.
 * If mocks aren't installed pre-navigation, the real server is hit.
 */

import type { Page } from '@playwright/test';

export interface EvaluationCoverageFixture {
  state: 'COMPLETE' | 'PARTIAL';
  errors: Array<Record<string, unknown>>;
}

export interface FindingsSummaryFixture {
  findingsEvaluated?: boolean;
  evaluationCoverage?: EvaluationCoverageFixture;
  hasFindings?: boolean;
  severityCounts?: Partial<Record<'critical' | 'high' | 'medium' | 'low' | 'info', number>>;
  total?: number;
}

export interface SnapshotFixture {
  domain: string;
  snapshotId: string;
  zoneManagement?: string;
  resultState?: 'complete' | 'partial' | 'failed';
  queriedNames?: string[];
  queriedTypes?: string[];
  vantages?: string[];
  evaluationCoverage?: EvaluationCoverageFixture;
  findingsSummary?: FindingsSummaryFixture;
}

export interface DelegationFixture {
  delegation: Record<string, unknown> | null;
  issues?: Array<Record<string, unknown>>;
}

export interface MailFixture {
  findingsMail?: Record<string, unknown>;
  selectors?: { selectors: unknown[] };
}

/**
 * Mock the domain latest snapshot + observations endpoints.
 * Must be called BEFORE page.goto().
 */
export async function mockDomainSnapshot(page: Page, fixture: SnapshotFixture): Promise<void> {
  const {
    domain,
    snapshotId,
    zoneManagement,
    resultState,
    queriedNames,
    queriedTypes,
    vantages,
    evaluationCoverage,
    findingsSummary,
  } = fixture;
  const coverage =
    findingsSummary?.evaluationCoverage ||
    evaluationCoverage ||
    ({ state: 'COMPLETE', errors: [] } satisfies EvaluationCoverageFixture);
  const total = findingsSummary?.total ?? 0;
  const severityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    ...findingsSummary?.severityCounts,
  };

  await page.route(`**/api/domain/${domain}/latest`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: snapshotId,
        domainId: `dom-${snapshotId}`,
        zoneManagement: zoneManagement ?? 'unmanaged',
        resultState: resultState ?? 'complete',
        rulesetVersionId: `ruleset-${snapshotId}`,
        metadata: { evaluation: coverage },
        createdAt: new Date().toISOString(),
        queriedNames: queriedNames ?? [domain],
        queriedTypes: queriedTypes ?? ['A', 'NS', 'SOA'],
        vantages: vantages ?? ['default'],
      }),
    });
  });

  await page.route(`**/api/snapshot/${snapshotId}/observations`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route(`**/api/snapshot/${snapshotId}/findings/summary`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        snapshotId,
        findingsEvaluated: findingsSummary?.findingsEvaluated ?? coverage.state === 'COMPLETE',
        evaluationCoverage: coverage,
        hasFindings: findingsSummary?.hasFindings ?? total > 0,
        severityCounts,
        total,
      }),
    });
  });
}

/**
 * Mock delegation and delegation/issues endpoints.
 * Must be called BEFORE page.goto().
 */
export async function mockDelegation(
  page: Page,
  snapshotId: string,
  fixture: DelegationFixture
): Promise<void> {
  await page.route(`**/api/snapshot/${snapshotId}/delegation`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        delegation: fixture.delegation,
      }),
    });
  });

  await page.route(`**/api/snapshot/${snapshotId}/delegation/issues`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        issues: fixture.issues ?? [],
      }),
    });
  });
}

/**
 * Mock mail findings and DKIM selectors endpoints.
 * Must be called BEFORE page.goto().
 */
export async function mockMail(
  page: Page,
  snapshotId: string,
  fixture: MailFixture
): Promise<void> {
  if (fixture.findingsMail) {
    await page.route(`**/api/snapshot/${snapshotId}/findings/mail`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fixture.findingsMail),
      });
    });
  }

  await page.route(`**/api/snapshot/${snapshotId}/selectors`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixture.selectors ?? { selectors: [] }),
    });
  });
}

/**
 * Mock the POST /api/collect/domain refresh endpoint.
 * Must be called BEFORE the refresh action.
 */
export async function mockRefresh(
  page: Page,
  response: { status: number; body: Record<string, unknown> }
): Promise<void> {
  await page.route('**/api/collect/domain', (route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify(response.body),
      });
    } else {
      route.continue();
    }
  });
}

/**
 * Wait for Domain 360 page to finish client-side hydration and data loading.
 * Uses the `data-loaded` attribute which is only set after React hydrates
 * and the client-side fetch completes (guarantees event handlers are attached).
 */
export async function waitForDomainPageReady(page: Page, timeout = 15000): Promise<void> {
  await page.locator('[data-loaded]').waitFor({ state: 'attached', timeout });
}
