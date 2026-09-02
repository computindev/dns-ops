---
id: domain.overview
surface: web
profile: changed
paths:
  - apps/web/app/routes/index.tsx
  - apps/web/app/routes/domain/$domain.tsx
  - apps/web/app/components/DomainInput.tsx
  - apps/web/app/components/DNSViews.tsx
  - apps/web/app/components/MailFindingsPanel.tsx
  - apps/web/app/components/MailFindingsPanel.test.ts
  - apps/web/app/lib/dns-ttl.ts
  - apps/web/app/lib/dns-ttl.test.ts
  - apps/web/app/lib/domain-route.test.ts
  - apps/web/e2e/domain-states.spec.ts
  - apps/web/e2e/finding-simulation.spec.ts
  - apps/collector/src/dns/collector.ts
  - apps/collector/src/dns/collector.concurrency.test.ts
  - apps/collector/src/dns/integration.test.ts
  - packages/db/src/schema/index.ts
  - .agents/verify-kit/verify.mjs
  - .agents/verify-kit/working-tree.test.mjs
  - .agents/skills/verify-dns-ops/harness/web.mts
always_with: []
---
# Open Domain 360

An operator types a domain on the home page and opens Domain 360 (overview / DNS / mail / delegation / history).

## Sub-features

- Home textbox **Domain name** and button **Analyze**.
- Navigation to `/domain/{domain}` with a heading containing that domain.
- Tabs **Overview**, **DNS**, **Mail**, **History**. **Delegation** only when that tab is enabled.
- DNS tab, Parsed view: every record row shows **Remaining TTL** (live countdown from the latest matching successful `public-recursive` answer; exact deadline is a valid `0`) and **Estimated live at** (machine-readable `<time datetime>`, the observed recursive-cache expiry). Missing, invalid, future-dated, or expired evidence renders a visible `UNKNOWN` in both cells.

## How to get to it (user POV)

1. Open `/` (must already be authenticated or using local e2e headers).
2. Fill **Domain name** with e.g. `google.com`.
3. Click **Analyze**.
4. See Domain 360 for that name.

## Driving it with harness/web.mts

```ts
await page.goto(`${BASE_URL}/`);
await page.getByRole('textbox', { name: /domain name/i }).fill('google.com');
await page.getByRole('button', { name: /analyze/i }).click();
await page.getByRole('heading', { name: /google\.com/i }).waitFor({ timeout: 15_000 });
await page.getByRole('tab', { name: /overview/i }).waitFor();
```

## Proof

### Expected observations
- URL matches `/domain/google.com`.
- Tabs Overview, DNS, Mail, and History are visible. Delegation is visible only when the product shows that tab.
- DNS Parsed view renders `Remaining TTL` and `Estimated live at` column headers; every body row's two new cells are populated (`N s remaining` + `<time datetime>`, or `UNKNOWN` ×2) — never blank. Rendered live rows agree with persisted recursive evidence and the `dns-ttl-audit` read-back.
- On the Mail tab, existing findings render as accessible named cards. After authenticated actionable-type discovery returns `supportedTypeIds`, each matching existing card shows a visible `Simulate` sibling primary button, including review-only findings; unsupported findings remain visible and expandable without that button.
- Activating a finding's `Simulate` button sends only `{ findingId }` to the authenticated single-finding endpoint. A valid result renders `Guidance only`, its returned title, explanation, and playbook reference, plus `No DNS changes are applied.`; no Apply control, executable mutation, provider record value, or projected resolution appears.
- Actionable-type or simulation failures preserve existing findings and fail closed. The aggregate Overview remediation panel remains controlled by `VITE_FEATURE_SIMULATION`; that gate does not hide per-finding guidance actions.

### Forbidden observations
- Staying on `/` after Analyze with a valid domain.
- Driving with CSS class selectors.
- Deriving the estimate from the averaged record TTL instead of matching recursive answers; blank TTL cells.
- Nesting `Simulate` inside the finding accordion button, guessing supported types, or hiding findings when actionable-type discovery fails.
- Rendering a non-guidance response, proposed change, executable mutation, Apply/provider-write control, or projected-resolution claim.

### Read-back
- The Domain 360 heading shows the submitted domain. Snapshot/findings JSON is optional; empty snapshot is allowed.
- Harness stores the raw observations (`dns-observations`), persisted-vs-rendered deadline audit (`dns-ttl-audit`), and a per-row audit of the two TTL cells (`dns-ttl-cells`). The harness fails on API errors, missing timing metadata/server time, absent usable recursive evidence, all-UNKNOWN output, unexpected live values, or mismatched rows/countdowns.

## Gotchas

- Home `beforeLoad` requires auth (`requireAuthGuard`). Unauthenticated visits bounce; that is `blocked` until login or e2e headers.
- Live collection needs collector + `COLLECTOR_URL`. Overview chrome can still render without a snapshot.
- A paused Playwright clock blocks client hydration; e2e uses `setFixedTime` with running timers. The product countdown uses the server HTTP `Date` anchor plus `performance.now()` elapsed time, never browser `Date.now()`.
- Without a reachable DB the domain page's `__root` auth/me fetch crashes on HTML error bodies; e2e must mock `/api/auth/me`.
- No persisted snapshot with recursive evidence → receipt is `blocked`, not `passed`.
