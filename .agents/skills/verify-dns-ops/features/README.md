# dns-ops feature map

One file per user-facing feature, from the user's point of view: what it is, how to reach it, how to drive it, what observable end state proves it works. These files teach how to *use* a feature, not how it is built; read the code for internals. This map is the maintained verification source for dns-ops: frontmatter (`id`, `surface`, `profile`, `paths`, `always_with`) is machine-read by `verify.mjs`.

## Index

| id | surface | profile | file |
|---|---|---|---|
| health.public | api | changed | health.public.md |
| auth.login | web | critical | auth.login.md |
| auth.api-principal | api | critical | auth.api-principal.md |
| domain.overview | web | changed | domain.overview.md |
| portfolio.search | web | critical | portfolio.search.md |
| fleet.reports | web | critical | fleet.reports.md |
| collector.request-body-limits | api | critical | collector.request-body-limits.md |

## Baseline preconditions (unless a feature file overrides them)

- App running from the current checkout; `.agents/skills/verify-dns-ops/harness/doctor.sh` healthy.
- There is no `/version` sha endpoint. Confirm the process you started is this worktree (cwd + pid), not a random leftover on port 3000.
- Identity: local e2e headers `X-Dev-Tenant=dns-ops-e2e` and `X-Dev-Actor=e2e-bot`, or a real session from `/login`. No modal, toast or unsaved draft open.
- Do not enable `ENABLE_ACTIVE_PROBES` or hit provider-write paths. Simulation is guidance-only.

## Driving conventions

- Selectors: ARIA role/label → `data-action-id` → `data-state`. This repo has no `data-action-id` values; use roles/labels from the feature file.
- Never sleep; poll the semantic end state the feature file names.
- Console errors and failed requests are captured for the whole drive.
- Native dialogs, real OAuth, real payment pages are manual unless the harness supports them: report `unreachable`, never `passed`.

## Proof and skip reporting

The feature file defines the coverage set; driving one entry point when the file lists others is partial and must say so. Receipts are `passed` · `failed` · `blocked` · `unreachable` · `not_applicable`; the last three need a reason. There is no `skipped`.
