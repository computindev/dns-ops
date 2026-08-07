import { expect, type Page, test } from '@playwright/test';

const observedAt = '2026-08-07T20:00:00.000Z';

type CaseFixture = {
  case: {
    id: string;
    domainId: string;
    signalId: string;
    status: 'OPEN' | 'ACKNOWLEDGED';
    version: number;
    disposition: string | null;
    note: string | null;
    acknowledgedAt: string | null;
    acknowledgedBy: string | null;
    resolvedAt: string | null;
    verificationSnapshotId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  signal: {
    id: string;
    domainId: string;
    kind: 'TLS_CERTIFICATE_REGRESSION' | 'DOMAIN_EXPIRING_SOON';
    conditionKey: string;
    status: 'ACTIVE';
    firstSeenSnapshotId: string | null;
    lastSeenSnapshotId: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    resolvedAt: string | null;
  };
  domain: { id: string; name: string };
};

function caseFixture(input: {
  caseId: string;
  domain: string;
  domainId: string;
  kind: CaseFixture['signal']['kind'];
  status: CaseFixture['case']['status'];
  disposition?: string | null;
  version?: number;
}): CaseFixture {
  return {
    case: {
      id: input.caseId,
      domainId: input.domainId,
      signalId: `signal-${input.caseId}`,
      status: input.status,
      version: input.version ?? 1,
      disposition: input.disposition ?? null,
      note: null,
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      verificationSnapshotId: null,
      createdAt: observedAt,
      updatedAt: observedAt,
    },
    signal: {
      id: `signal-${input.caseId}`,
      domainId: input.domainId,
      kind: input.kind,
      conditionKey: `${input.domainId}:${input.kind.toLowerCase()}`,
      status: 'ACTIVE',
      firstSeenSnapshotId: 'snapshot-1',
      lastSeenSnapshotId: 'snapshot-2',
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      resolvedAt: null,
    },
    domain: { id: input.domainId, name: input.domain },
  };
}

function caseDetail(item: CaseFixture) {
  return {
    ...item,
    events: [
      {
        id: `event-${item.case.id}`,
        caseId: item.case.id,
        actorId: 'operator@example.test',
        fromStatus: null,
        toStatus: item.case.status,
        note: null,
        disposition: item.case.disposition,
        verificationSnapshotId: null,
        createdAt: observedAt,
      },
    ],
  };
}

async function mockCases(page: Page, options: { staleDisposition?: boolean } = {}) {
  let cases = [
    caseFixture({
      caseId: 'case-tls',
      domain: 'api.example.test',
      domainId: 'domain-api',
      kind: 'TLS_CERTIFICATE_REGRESSION',
      status: 'OPEN',
    }),
    caseFixture({
      caseId: 'case-expiry',
      domain: 'www.example.test',
      domainId: 'domain-www',
      kind: 'DOMAIN_EXPIRING_SOON',
      status: 'ACKNOWLEDGED',
      disposition: 'Registrar owner notified.',
    }),
  ];
  const patchRequests: Array<{ caseId: string; body: Record<string, unknown> }> = [];
  let listRequests = 0;

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        email: 'operator@example.test',
        tenant: 'tenant-e2e',
      }),
    })
  );
  await page.route('**/api/cases', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    listRequests += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ cases }) });
  });
  await page.route('**/api/cases/*/disposition', async (route) => {
    const caseId = route.request().url().split('/').at(-2);
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (
      !caseId ||
      typeof body.disposition !== 'string' ||
      typeof body.expectedVersion !== 'number'
    ) {
      throw new Error('Unexpected case disposition request');
    }
    patchRequests.push({ caseId, body });
    if (options.staleDisposition) {
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Case version is stale', code: 'CASE_VERSION_STALE' }),
      });
    }
    cases = cases.map((item) =>
      item.case.id === caseId
        ? {
            ...item,
            case: {
              ...item.case,
              disposition: body.disposition,
              version: item.case.version + 1,
              updatedAt: observedAt,
            },
          }
        : item
    );
    const updated = cases.find((item) => item.case.id === caseId);
    if (!updated) throw new Error(`Unknown case fixture: ${caseId}`);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ case: updated.case }),
    });
  });
  await page.route('**/api/cases/*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const caseId = route.request().url().split('/').at(-1);
    const item = cases.find((candidate) => candidate.case.id === caseId);
    if (!item) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(caseDetail(item)),
    });
  });

  return {
    getListRequests: () => listRequests,
    getPatchRequests: () => patchRequests,
  };
}

async function openCasesWorkspace(page: Page) {
  await page.goto('/cases');
  await expect(page.getByRole('heading', { name: 'Cases & Signals' })).toBeVisible();
  await expect(page.getByRole('button', { name: /TLS Certificate Regression/i })).toBeVisible();
}

test.describe('Cases workspace', () => {
  test('filters the canonical queue and updates the evidence detail', async ({ page }) => {
    await mockCases(page);
    await openCasesWorkspace(page);

    await expect(page.getByRole('heading', { name: '2 visible cases' })).toBeVisible();
    await page.getByRole('button', { name: /Domain Expiring Soon/i }).click();
    await expect(page.getByRole('heading', { name: 'Domain Expiring Soon' })).toBeVisible();
    await expect(page.locator('.cases-detail').getByText('www.example.test')).toBeVisible();

    await page.getByLabel('Signal kind').selectOption('TLS_CERTIFICATE_REGRESSION');
    await expect(page.getByRole('heading', { name: '1 visible cases' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Domain Expiring Soon/i })).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByRole('heading', { name: '2 visible cases' })).toBeVisible();
  });

  test('refreshes the queue and saves a disposition with visible confirmation', async ({
    page,
  }) => {
    const api = await mockCases(page);
    await openCasesWorkspace(page);

    await page.getByRole('button', { name: 'Refresh queue' }).click();
    await expect.poll(api.getListRequests).toBeGreaterThanOrEqual(2);

    const disposition = page.getByRole('textbox', { name: 'Operator disposition' });
    await disposition.fill('Certificate owner contacted; awaiting replacement evidence.');
    await page.getByRole('button', { name: 'Save disposition' }).click();

    await expect(page.getByRole('button', { name: 'Disposition saved' })).toBeVisible();
    await expect.poll(api.getPatchRequests).toEqual([
      {
        caseId: 'case-tls',
        body: {
          disposition: 'Certificate owner contacted; awaiting replacement evidence.',
          expectedVersion: 1,
        },
      },
    ]);
  });

  test('explains a stale disposition instead of losing the operator’s context', async ({
    page,
  }) => {
    const api = await mockCases(page, { staleDisposition: true });
    await openCasesWorkspace(page);

    await page
      .getByRole('textbox', { name: 'Operator disposition' })
      .fill('Awaiting the certificate rotation window.');
    await page.getByRole('button', { name: 'Save disposition' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'Another operator changed this case. The current record has been refreshed.'
    );
    await expect.poll(api.getListRequests).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole('button', { name: 'Save disposition' })).toBeEnabled();
  });

  test('has no horizontal overflow or wrapped navigation controls on supported mobile widths', async ({
    page,
  }) => {
    await mockCases(page);

    for (const width of [320, 375, 414, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await openCasesWorkspace(page);

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
              '.ds-primary-nav a, .ds-primary-nav button, .ds-button > span'
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
