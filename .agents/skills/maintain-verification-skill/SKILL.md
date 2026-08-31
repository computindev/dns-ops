---
name: maintain-verification-skill
description: Keep a repo's verify-<app> skill and its feature map honest as the app changes: compare every mapped feature with current source, fix doc drift, run a live verification pass, and report product regressions without hiding them. Use when someone says "maintain the verification skill", "is the feature map still accurate", "the verify skill is stale", after a large refactor or UI change, before a release, or on a periodic cadence in repos that have .agents/skills/verify-*. Never use it to fix product code.
---

# Maintain a verification skill

Adapted from pstack's `maintain-verification-skill` (Lauren Tan, MIT). One rule above all: **only edit the verification skill's own directory** (`.agents/skills/verify-<app>/`: SKILL.md, features/, harness/). Never edit product code during a maintenance run. A behavior the map describes that the app no longer does is either doc drift (fix the map) or a product regression (report it, with evidence, and stop). Papering over a regression in the docs is the one failure this skill exists to prevent.

## 1. Locate the target

Find the verify skill: `verification/policy.json` → `skill`, else the single `.agents/skills/verify-*/`. Several candidates → ask which. None → stop and point at the `create-verification-skill` skill; do not invent one.

## 2. Index hygiene

Read `features/README.md` and glob its siblings. Fix missing, extra, duplicate or dead index entries. Every feature file needs valid frontmatter (`id`, `surface`, `profile`, `paths`); confirm with `node .agents/verify-kit/verify.mjs features`. Then `node .agents/verify-kit/verify.mjs lint-map --fresh`: it lists selectors/states/routes the map references that no longer exist in source (drift to fix in step 5), dead `paths` globs (moved modules), and product actions no feature covers (candidates for new files). Keep it lightweight; no generated inventories beyond that.

## 3. Source wave (read-only)

For each feature file, from source: how does this user-facing feature work today? Use one read-only subagent per feature when the harness supports it, launched concurrently; otherwise sequentially. Each returns: (a) drift candidates with file:line citations — renamed routes, changed selectors, new required preconditions, removed sub-features, new sub-features worth mapping; (b) one concise live-verification recipe for the feature as it exists now. Also check the `paths` globs still point at the code that implements the feature (moved modules are the most common silent drift).

## 4. Live pass

`node .agents/verify-kit/verify.mjs run-new --label maintain` → Launch → Doctor → drive **at least one** feature; with `--full` (or before a release) drive every `profile: critical` feature. Write a receipt per driven feature with `--verifier builder --session "maintain"`. Doctor failures are reported as `blocked` with the doctor output attached.

## 5. Classify what you found

| Finding | Action |
|---|---|
| Map says X, app does Y, and Y is intended (commit/PR/issue shows it) | doc drift → update the feature file, cite the source |
| Map says X, app does Y, and nothing shows Y was intended | **product regression** → receipt `failed`, evidence attached, stop; do not edit the map to match |
| Selector/route gone, feature still exists | drift → update Driving section and harness, rerun lint-selectors |
| Feature removed from product | drift → delete the file and index row; note the deletion in the report |
| New user-facing capability with no file | propose a new feature file (seed only if it is critical or the user asks) |

## 6. Report

Return: files changed in the skill dir; drift fixed (with citations); regressions found (feature id, receipt path, evidence); features not driven and why; suggested cadence only if asked. Commit the skill changes on their own branch/commit, never mixed with product changes.
