# Verifiability contract for web apps (one page, enforced)

The feature map stays cheap to maintain only if the product is built to be driven predictably. Add this to the repo's `TECH-STACK.md` / architecture policy and enforce it with lint, not with prose.

## Rules

1. **Accessible names on every important control.** Buttons, links, inputs, comboboxes carry a visible label or `aria-label`. Playwright drives by role + name first.
2. **`data-action-id` on business actions.** Format `<domain>.<capability>.<verb>` (`order.dispatch.submit`). Stable across redesigns; never derived from copy.
3. **`data-state` on observable states.** Screens and key components expose their semantic state (`order-dispatched`, `inbox-filtered`, `app-ready`). Drives poll these; they never sleep.
4. **No presentation selectors.** Tests and harnesses may not select by Tailwind/CSS classes or coordinates. `verify.mjs lint-selectors` fails the build.
5. **`doctor` command.** One read-only command answering: process up, sha of the running build, DB reachable, migrations applied, verification user present.
6. **Deterministic identity.** A seeded verification user and a dev login path that needs no live OAuth and no inbox. Real OAuth is `unreachable`, by design.
7. **Disposable tenant per run.** Everything a verification creates is tagged with `verify-<run_id>` and deletable with one command.
8. **Read-back for every critical side effect.** Button → API accepted → row/state changed → outbox/audit event → projection. Each hop has a public read path the verifier can query; the toast proves nothing.
9. **External effects go through adapters with a sandbox or fake.** Couriers, payments, mail, wallets: the harness never hits production hosts (forbidden observation).
10. **Idempotency on mutating commands.** Duplicate submission converges or is rejected explicitly, and the verifier can prove it.
11. **`/version` endpoint** (or CLI `--version`) exposing git sha and build time, so a receipt can be bound to what actually ran.
12. **Console and failed-request cleanliness** is an expected observation for every web feature unless the feature file says otherwise.

## Enforcement (cheaper than any schema)

- ESLint / custom rule: forbid `locator('.…')`, `page.click('.…')`, `waitForTimeout`, `mouse.click(x, y)` under `harness/` and `e2e/` (verify-kit ships a grep-based lint; upgrade to an ESLint rule when the repo has one).
- Architecture test: components in `routes/**` that call a mutation must render a `data-state` for its result (dependency-cruiser or a small AST test).
- CI: `verify.mjs check-ci` + `lint-selectors` on every PR.
