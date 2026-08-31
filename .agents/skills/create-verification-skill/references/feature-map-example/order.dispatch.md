---
id: order.dispatch
surface: web
profile: critical
paths:
  - apps/web/src/routes/orders/**
  - packages/core/src/dispatch/**
  - packages/db/src/schema/dispatch*.ts
always_with:
  - order.dispatch.duplicate-guard
---
# Dispatch an order

From the inbox, an operator turns a confirmed order into a shipment: chooses the courier, generates the label, and the order moves to *Despachado* with tracking visible. This is the action the duplicate-shipment guarantee protects.

## Sub-features

- Courier selection (Flapp / Blue Express / ALAS) with the tenant's enabled couriers only
- Label generation (PDF) and download
- Partial dispatch (subset of lines) leaving the rest *Pendiente*
- Tracking number stored and shown on the order

## How to get to it (user POV)

1. Inbox `/orders` → filter *Confirmado* → open an order.
2. Button **Despachar** (`data-action-id="order.dispatch.open"`).
3. Modal: courier select (`role=combobox`, label *Courier*), lines table with checkboxes, **Generar etiqueta** (`data-action-id="order.dispatch.submit"`).

## Driving it with Playwright (`harness/web.mts`)

```ts
await login(page);                       // seeded user, tenant verify-<run_id>
const order = await api.createConfirmedOrder({ lines: 2 });   // via the real public API, not a test endpoint
await page.goto(`${BASE_URL}/orders/${order.id}`);
await page.locator('[data-action-id="order.dispatch.open"]').click();
await page.getByRole('combobox', { name: 'Courier' }).selectOption('flapp-sandbox');
await page.locator('[data-action-id="order.dispatch.submit"]').click();
await page.locator('[data-state="order-dispatched"]').waitFor({ timeout: 15_000 });
await ev.shot(page, 'order-dispatched');
```

## Proof

### Expected observations
- `[data-state="order-dispatched"]` visible; tracking number rendered and non-empty.
- Read-back `GET /api/orders/:id` → `status: "dispatched"`, `shipments.length === 1`, `shipments[0].tracking` matches the UI.
- DB read-back: one row in `dispatches` for the order; `outbox` has one `order.dispatched` event with the run's tenant id.
- A `label.pdf` downloaded into `$VERIFY_RUN_DIR`, > 1 KB, first bytes `%PDF`.

### Forbidden observations
- No console errors during the flow.
- No request to a production courier host (only `*.sandbox.*` or the fake adapter).
- Submitting the modal twice (double-click) does **not** create a second `dispatches` row — this is `order.dispatch.duplicate-guard`, verified together.

### Read-back
- API and DB as above; the UI toast alone proves nothing.

## Gotchas

- The courier combobox is populated after the tenant settings query resolves; wait for `role=combobox` to be enabled, not for the modal.
- Label generation calls the sandbox synchronously; a 502 from the sandbox shows as `data-state="dispatch-error"` — that is a `blocked` receipt with the sandbox response attached, not a `failed` one, unless the code path itself is wrong.
- Partial dispatch keeps the order in *Confirmado* with a *Parcial* badge; the end state is `data-state="order-partially-dispatched"`.
