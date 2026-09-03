import { expect, test } from '@playwright/test';
import {
  type EvidenceResponse,
  mockDomainSnapshot,
  type SnapshotFixture,
  waitForDomainPageReady,
} from './support/domain-fixtures.js';

const DOMAIN = 'signal-room.example.test';

type SignalRoomOptions = {
  snapshot?: Omit<Partial<SnapshotFixture>, 'domain' | 'snapshotId'>;
  evidence?: EvidenceResponse['evidence'];
};

async function mockSignalRoomDomain(
  page: import('@playwright/test').Page,
  options: SignalRoomOptions = {}
): Promise<void> {
  await mockDomainSnapshot(page, {
    domain: DOMAIN,
    snapshotId: 'current-snapshot',
    ...options.snapshot,
  });

  await page.route(`**/api/domains/${DOMAIN}/profile`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        profile: { purpose: 'PUBLIC_WEB', criticality: 'HIGH' },
        setup: null,
      }),
    })
  );
  await page.route(`**/api/domains/${DOMAIN}/evidence`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        snapshotId: 'current-snapshot',
        evidence: options.evidence ?? [
          {
            id: 'tls-missing-baseline',
            probeType: 'tls_cert',
            status: 'success',
            success: true,
            errorMessage: null,
            freshness: 'MISSING_BASELINE',
            probeData: { status: 'OBSERVED' },
          },
          {
            id: 'dns-current',
            probeType: 'dns',
            status: 'success',
            success: true,
            errorMessage: null,
            freshness: 'CURRENT',
            probeData: { status: 'OBSERVED' },
          },
        ],
      }),
    })
  );
  await page.route(`**/api/snapshots/${DOMAIN}?limit=50`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        snapshots: [
          {
            id: 'snapshot-older',
            createdAt: '2026-08-01T12:00:00.000Z',
            rulesetVersionId: 'ruleset-older',
            findingsEvaluated: true,
            evaluationCoverage: { state: 'COMPLETE', errors: [] },
            queryScope: { names: [DOMAIN], types: ['A', 'MX'], vantages: ['default'] },
          },
          {
            id: 'snapshot-newer',
            createdAt: '2026-08-02T12:00:00.000Z',
            rulesetVersionId: 'ruleset-newer',
            findingsEvaluated: false,
            evaluationCoverage: {
              state: 'PARTIAL',
              errors: [
                {
                  unknown: {
                    explanation: 'The collector did not complete all checks.',
                    actionLabel: 'Run a fresh scan',
                  },
                },
              ],
            },
            queryScope: { names: [DOMAIN], types: ['A'], vantages: ['default'] },
          },
        ],
      }),
    })
  );
  await page.route(`**/api/snapshots/${DOMAIN}/compare-latest`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        diff: {
          snapshotA: {
            id: 'snapshot-older',
            createdAt: '2026-08-01T12:00:00.000Z',
            rulesetVersion: 'ruleset-older',
          },
          snapshotB: {
            id: 'snapshot-newer',
            createdAt: '2026-08-02T12:00:00.000Z',
            rulesetVersion: 'ruleset-newer',
          },
          comparison: {
            recordChanges: [
              {
                type: 'modified',
                name: DOMAIN,
                recordType: 'A',
                diff: { added: ['192.0.2.2'], removed: ['192.0.2.1'] },
              },
            ],
            ttlChanges: [],
            findingChanges: [],
            scopeChanges: null,
            rulesetChange: null,
          },
          summary: { totalChanges: 1, additions: 0, deletions: 0, modifications: 1, unchanged: 0 },
          findingsSummary: {
            totalChanges: 0,
            added: 0,
            removed: 0,
            modified: 0,
            unchanged: 0,
            severityChanges: 0,
          },
        },
      }),
    })
  );
}

test.describe('Domain 360 Signal Room', () => {
  test('opens with a labelled completeness region and keeps setup gaps UNKNOWN', async ({
    page,
  }) => {
    await mockSignalRoomDomain(page);
    await page.goto(`/domain/${DOMAIN}`);
    await waitForDomainPageReady(page);

    const evidence = page.getByRole('region', { name: /evidence completeness/i });
    await expect(evidence).toHaveAttribute('data-state', 'unknown');
    await expect(
      evidence.getByRole('heading', { name: 'Evidence completeness', level: 2 })
    ).toBeVisible();
    await expect(page.getByTestId('domain-needs-setup-evidence')).toHaveClass(/ds-panel--muted/);
    await expect(
      page.getByTestId('domain-needs-setup-evidence').getByText('Accept baseline')
    ).toHaveClass(/ds-badge--unknown/);
    await expect(page.getByTestId('domain-current-evidence').getByText('Current')).toHaveClass(
      /ds-badge--success/
    );
  });

  test('keeps partial coverage plus zero findings UNKNOWN and actionable', async ({ page }) => {
    const partialCoverage = {
      state: 'PARTIAL' as const,
      errors: [
        {
          code: 'RULE_EXECUTION_FAILED',
          ruleId: 'dns.example',
          message: 'Rule failed',
          status: 'UNKNOWN',
          unknown: {
            reason: 'CHECK_EVALUATION_FAILED',
            explanation: 'This check could not be evaluated.',
            action: 'RUN_FRESH_SCAN',
            actionLabel: 'Run a fresh scan',
            blocking: true,
          },
        },
      ],
    };
    await mockSignalRoomDomain(page, {
      snapshot: {
        evaluationCoverage: partialCoverage,
        findingsSummary: {
          findingsEvaluated: false,
          evaluationCoverage: partialCoverage,
          hasFindings: false,
          total: 0,
        },
      },
      evidence: [
        {
          id: 'dns-current',
          probeType: 'dns',
          status: 'success',
          success: true,
          errorMessage: null,
          freshness: 'CURRENT',
          probeData: { status: 'OBSERVED' },
        },
      ],
    });
    await page.goto(`/domain/${DOMAIN}`);
    await waitForDomainPageReady(page);

    const evidence = page.getByRole('region', { name: /evidence completeness/i });
    await expect(evidence).toHaveAttribute('data-state', 'unknown');
    await expect(evidence.getByRole('group', { name: 'Findings' })).toHaveAttribute(
      'data-state',
      'unknown'
    );
    await expect(evidence).toContainText('0 observed does not establish health');
    await expect(evidence).toContainText('Run a fresh scan');
  });

  test('allows healthy zero findings only with complete coverage and no setup gaps', async ({
    page,
  }) => {
    const completeCoverage = { state: 'COMPLETE' as const, errors: [] };
    await mockSignalRoomDomain(page, {
      snapshot: {
        evaluationCoverage: completeCoverage,
        findingsSummary: {
          findingsEvaluated: true,
          evaluationCoverage: completeCoverage,
          hasFindings: false,
          total: 0,
        },
      },
      evidence: [
        {
          id: 'dns-current',
          probeType: 'dns',
          status: 'success',
          success: true,
          errorMessage: null,
          freshness: 'CURRENT',
          probeData: { status: 'OBSERVED' },
        },
      ],
    });
    await page.goto(`/domain/${DOMAIN}`);
    await waitForDomainPageReady(page);

    const evidence = page.getByRole('region', { name: /evidence completeness/i });
    await expect(evidence).toHaveAttribute('data-state', 'complete');
    await expect(evidence.getByRole('group', { name: 'Findings' })).toHaveAttribute(
      'data-state',
      'known'
    );
    await expect(
      evidence.getByRole('group', { name: 'Findings' }).getByText('0', { exact: true })
    ).toHaveClass(/ds-badge--success/);
    await expect(evidence).toContainText('No findings detected by the current evaluated ruleset.');
  });

  test('keeps evidence history usable without root overflow at supported widths', async ({
    page,
  }) => {
    await mockSignalRoomDomain(page);
    await page.goto(`/domain/${DOMAIN}`);
    await waitForDomainPageReady(page);
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByTestId('snapshot-history-panel')).toBeVisible();

    await page.getByTestId('compare-latest-btn').click();
    await expect(page.getByTestId('diff-result')).toBeVisible();
    await expect(page.getByTestId('record-changes')).toContainText('192.0.2.2');

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
              '.domain-360__tab, .domain-history__actions .ds-button > span'
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
