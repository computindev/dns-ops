# <app> feature map (example)

One file per user-facing feature, from the user's point of view: what it is, how to reach it, how to drive it, what proves it worked. Read the relevant file before driving or reproducing that surface. These files teach how to *use* a feature; read the code for internals, which change faster than any doc.

This map is the maintained verification source for <app>. Machine-read fields live in each file's frontmatter (`id`, `surface`, `profile`, `paths`, `always_with`).

## Index

| id | surface | profile | file |
|---|---|---|---|
| order.create | web | changed | order.create.md |
| order.dispatch | web | critical | order.dispatch.md |
| order.dispatch.duplicate-guard | api | critical | order.dispatch.duplicate-guard.md |

## Baseline preconditions (unless a feature file overrides them)

- The app is running from the current checkout: `harness/doctor.sh` reports healthy and the `/version` sha matches `git rev-parse HEAD`.
- Signed in as the seeded verification user (`VERIFY_USER`), tenant `verify-<run_id>`; no modal, toast or unsaved draft is open.
- External providers (couriers, payment, mail) are on their sandbox or the repo's fake adapter; the feature file names which.

## Driving conventions

- Selectors: ARIA role/label first, then `data-action-id` (business actions) and `data-state` (observable states). Class selectors are not allowed; `lint-selectors` fails on them.
- Never sleep. Poll the semantic end state the feature file names (a `data-state` value, a row in a read-back query, a file on disk).
- Capture console errors and failed requests for the whole drive; a feature whose expected result includes "no console errors" fails on any.
- Native OS dialogs, real OAuth, real payment confirmation pages are manual unless the harness has first-class support; when unreachable, say so in the receipt as `unreachable`, never as `passed`.

## Proof and skip reporting

The feature file defines the coverage set. Driving one entry point when the file lists three is a partial proof: report which were exercised. Every receipt is `passed`, `failed`, `blocked`, `unreachable` or `not_applicable`; the last three require a reason. There is no `skipped`.
