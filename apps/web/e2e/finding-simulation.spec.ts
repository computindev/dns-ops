import { expect, test } from '@playwright/test';
import { mockDomainSnapshot, mockMail, waitForDomainPageReady } from './support/domain-fixtures.js';

const TEST_DOMAIN = 'finding-simulation.example.com';
const SNAPSHOT_ID = 'snap-finding-simulation';

function finding(
  id: string,
  type: string,
  title: string,
  options: { reviewOnly?: boolean; evidence?: string } = {}
): Record<string, unknown> {
  return {
    id,
    snapshotId: SNAPSHOT_ID,
    type,
    title,
    description: `${title} description`,
    severity: 'high',
    confidence: 'certain',
    riskPosture: 'high',
    blastRadius: 'single-domain',
    reviewOnly: options.reviewOnly ?? false,
    evidence: options.evidence ? [{ description: options.evidence }] : [],
    ruleId: `${type}.v1`,
    ruleVersion: '1.0.0',
    rulesetVersionId: 'ruleset-1',
    createdAt: '2026-09-01T12:00:00.000Z',
  };
}

function suggestion(id: string, findingId: string): Record<string, unknown> {
  return {
    id,
    findingId,
    title: 'Review the provider guidance',
    description: 'Confirm the provider instructions before making a change.',
    action: 'Playbook: mail.provider-confirmation',
    riskPosture: 'medium',
    blastRadius: 'single-domain',
    reviewOnly: true,
    appliedAt: null,
    appliedBy: null,
    dismissedAt: null,
    dismissedBy: null,
    dismissalReason: null,
    createdAt: '2026-09-01T12:00:00.000Z',
  };
}

function mailFindingsPayload(
  findings: Record<string, unknown>[],
  suggestions: Record<string, unknown>[] = []
): Record<string, unknown> {
  return {
    snapshotId: SNAPSHOT_ID,
    domain: TEST_DOMAIN,
    rulesetVersion: '1.0.0',
    persisted: true,
    evaluationCoverage: { state: 'COMPLETE', errors: [] },
    mailConfig: {
      hasMx: true,
      hasSpf: false,
      hasDmarc: false,
      hasDkim: false,
      hasMtaSts: false,
      hasTlsRpt: false,
      securityScore: 40,
      issues: [],
      recommendations: [],
    },
    findings,
    suggestions,
  };
}

function simulationResult(playbookId = 'mail.spf.provider-confirmation'): Record<string, unknown> {
  return {
    mode: 'GUIDANCE_ONLY',
    domain: TEST_DOMAIN,
    detectedProvider: 'unknown',
    proposedChanges: [],
    guidanceOnlySuggestions: [
      {
        kind: 'GUIDANCE_ONLY',
        title: 'Confirm authorized senders with the mail provider',
        explanation: 'Review provider instructions before planning a DNS change.',
        playbookId,
        requiresProviderConfirmation: true,
        executableMutation: null,
      },
    ],
    currentFindings: [],
    summary: { changesProposed: 0, guidanceProvided: 1, currentFindings: 0 },
  };
}

async function openMail(
  page: import('@playwright/test').Page,
  findings: Record<string, unknown>[],
  options: {
    actionableTypeIds?: string[];
    actionableStatus?: number;
    suggestions?: Record<string, unknown>[];
  } = {}
): Promise<() => number> {
  await mockDomainSnapshot(page, { domain: TEST_DOMAIN, snapshotId: SNAPSHOT_ID });
  await mockMail(page, SNAPSHOT_ID, {
    findingsMail: mailFindingsPayload(findings, options.suggestions),
    selectors: { selectors: [] },
  });

  let actionableTypesCalls = 0;
  await page.route('**/api/simulate/actionable-types', (route) => {
    actionableTypesCalls += 1;
    if (options.actionableStatus && options.actionableStatus !== 200) {
      return route.fulfill({
        status: options.actionableStatus,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unavailable' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'GUIDANCE_ONLY',
        supportedTypeIds: options.actionableTypeIds ?? [
          'mail.no-spf-record',
          'mail.no-dmarc-record',
        ],
      }),
    });
  });

  await page.goto(`/domain/${TEST_DOMAIN}?tab=mail`);
  await waitForDomainPageReady(page);
  await expect(
    page.getByRole('heading', { name: 'Mail Security Analysis', exact: true })
  ).toBeVisible();
  return () => actionableTypesCalls;
}

test.describe('Per-finding simulation guidance', () => {
  test('shows a primary Simulate sibling for supported findings without hiding other card behavior', async ({
    page,
  }) => {
    const spfFinding = finding('finding-spf', 'mail.no-spf-record', 'No SPF record');
    const reviewFinding = finding('finding-dmarc', 'mail.no-dmarc-record', 'No DMARC record', {
      reviewOnly: true,
      evidence: 'DMARC evidence requires review',
    });
    const unsupportedFinding = finding(
      'finding-unsupported',
      'mail.custom-check',
      'Unsupported mail check',
      { evidence: 'Existing evidence remains visible' }
    );
    await page.route('**/api/suggestions/suggestion-dmarc/dismiss', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    );

    const actionableTypesCalls = await openMail(
      page,
      [spfFinding, reviewFinding, unsupportedFinding],
      {
        suggestions: [suggestion('suggestion-dmarc', 'finding-dmarc')],
      }
    );

    const spfCard = page.getByRole('article', { name: 'No SPF record' });
    const reviewCard = page.getByRole('article', { name: 'No DMARC record' });
    const unsupportedCard = page.getByRole('article', { name: 'Unsupported mail check' });

    await expect(spfCard.getByRole('button', { name: /simulate/i })).toBeVisible();
    await expect(reviewCard.getByRole('button', { name: /simulate/i })).toBeVisible();
    await expect(
      spfCard.getByRole('button', { name: /no spf record description/i })
    ).toHaveAttribute('aria-expanded', 'false');
    await expect(reviewCard).toContainText('Review Required');
    await expect(unsupportedCard.getByRole('button', { name: /simulate/i })).toHaveCount(0);

    await unsupportedCard
      .getByRole('button', { name: /unsupported mail check description/i })
      .click();
    await expect(
      unsupportedCard.getByRole('heading', { name: 'Evidence', level: 6 })
    ).toBeVisible();
    await expect(unsupportedCard).toContainText('Existing evidence remains visible');

    await reviewCard.getByRole('button', { name: /no dmarc record description/i }).click();
    await expect(
      reviewCard.getByRole('heading', { name: 'Review the provider guidance', level: 6 })
    ).toBeVisible();
    await expect(reviewCard.getByRole('button', { name: /hide guidance/i })).toBeVisible();
    const dismissalRequest = page.waitForRequest(
      (request) =>
        request.url().includes('/api/suggestions/suggestion-dmarc/dismiss') &&
        request.method() === 'PATCH'
    );
    await reviewCard.getByRole('button', { name: /hide guidance/i }).click();
    expect((await dismissalRequest).postDataJSON()).toEqual({ reason: 'Dismissed by user' });

    await expect(page.getByRole('button', { name: /^Simulate /i })).toHaveCount(2);
    expect(actionableTypesCalls()).toBeGreaterThan(0);
  });

  test('posts only the finding id and renders guidance-only results', async ({ page }) => {
    const requestBodies: unknown[] = [];
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.route('**/api/simulate', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      requestBodies.push(route.request().postDataJSON());
      await responseGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(simulationResult()),
      });
    });

    await openMail(page, [finding('finding-spf', 'mail.no-spf-record', 'No SPF record')]);
    const card = page.getByRole('article', { name: 'No SPF record' });
    const simulateButton = card.getByRole('button', { name: /simulate/i });

    const simulationRequest = page.waitForRequest(
      (request) => request.url().includes('/api/simulate') && request.method() === 'POST'
    );
    await simulateButton.click();
    await simulationRequest;
    await expect(simulateButton).toBeDisabled();
    await expect(simulateButton).toHaveAttribute('aria-busy', 'true');

    releaseResponse();
    const status = card.getByRole('status');
    await expect(status).toContainText('Guidance only');
    await expect(status).toContainText('Confirm authorized senders with the mail provider');
    await expect(status).toContainText(
      'Review provider instructions before planning a DNS change.'
    );
    await expect(status).toContainText('Playbook reference: mail.spf.provider-confirmation');
    await expect(status).toContainText('No DNS changes are applied.');
    await expect(card.getByRole('button', { name: /apply/i })).toHaveCount(0);
    await expect(card).not.toContainText(/proposed record|executable mutation/i);
    expect(requestBodies).toEqual([{ findingId: 'finding-spf' }]);
  });

  test('fails closed when a simulation response is not guidance-only', async ({ page }) => {
    await page.route('**/api/simulate', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'GUIDANCE_ONLY',
          proposedChanges: [{ name: 'example.com', type: 'TXT', proposedValues: ['bad'] }],
          guidanceOnlySuggestions: [],
        }),
      })
    );

    await openMail(page, [finding('finding-spf', 'mail.no-spf-record', 'No SPF record')]);
    const card = page.getByRole('article', { name: 'No SPF record' });
    const simulateButton = card.getByRole('button', { name: /simulate/i });

    await simulateButton.click();
    await expect(card.getByRole('alert')).toContainText(/guidance-only results are required/i);
    await expect(simulateButton).toBeEnabled();
    await expect(card.getByRole('status')).toHaveCount(0);
  });

  test('preserves findings and fails closed when actionable type discovery is unavailable', async ({
    page,
  }) => {
    await openMail(page, [finding('finding-spf', 'mail.no-spf-record', 'No SPF record')], {
      actionableStatus: 503,
    });

    await expect(
      page.getByRole('alert').filter({ hasText: /per-finding guidance is unavailable/i })
    ).toBeVisible();
    const card = page.getByRole('article', { name: 'No SPF record' });
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: /simulate/i })).toHaveCount(0);
  });
});
