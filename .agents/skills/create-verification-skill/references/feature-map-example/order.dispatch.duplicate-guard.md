---
id: order.dispatch.duplicate-guard
surface: api
profile: critical
paths:
  - packages/core/src/dispatch/**
  - packages/db/src/schema/dispatch*.ts
---
# Duplicate dispatch is impossible

The guarantee the product sells: the same order cannot be dispatched twice, whatever the client does — double click, retry, two operators, a replayed webhook.

## Sub-features

- Double submit from the UI (same session)
- Concurrent submit from two sessions
- Replayed API call with the same idempotency key
- Replayed API call with a new key after a dispatch exists

## How to get to it (user POV)

Not a screen: it is the absence of a second shipment after any of the above. Reached through the dispatch modal (`order.dispatch`) or `POST /api/orders/:id/dispatch`.

## Driving it with `harness/api.mts`

```ts
const first = await call('dispatch', 'POST', `/api/orders/${order.id}/dispatch`, { courier: 'flapp-sandbox' });
const again = await call('dispatch-again', 'POST', `/api/orders/${order.id}/dispatch`, { courier: 'flapp-sandbox' });
const rb = await readback('shipments', `/api/orders/${order.id}`);
```

## Proof

### Expected observations
- `first.status === 201`; `again.status` is `200` with the same shipment id (idempotent) or `409` (rejected) — either is a pass, silence is not.
- Read-back: exactly one shipment; exactly one `dispatches` row; exactly one `order.dispatched` outbox event.

### Forbidden observations
- Two label PDFs generated; two courier sandbox calls for the same order.
- A `500` on the second call (must be a modeled outcome, not a crash).

### Read-back
- `GET /api/orders/:id` and, if available, a direct DB count on `dispatches where order_id = …`.

## Gotchas

- Concurrency needs two real sessions: run the two `POST`s with `Promise.all`, not sequentially, or the guard is not actually exercised.
- The unique constraint is on *active* dispatch: a cancelled dispatch followed by a new one is legitimate and must not be counted as a duplicate.
