---
name: verify-claim
description: Prove or disprove a specific claim about behavior or performance with baseline and treatment artifacts captured under identical conditions, ending in PROVEN, DISPROVEN or INCONCLUSIVE with evidence. Use when someone says "this makes it faster", "this fixes the bug", "no behavior change", "the refactor is equivalent", "verify this claim", "prove it", or when a PR asserts an improvement without numbers. Also use to record existing behavior before a refactor. Inspired by cursor-team-kit's verify-this.
---

# Verify a claim

"It feels faster" and "tests pass" are not evidence. A claim is verified by comparing a **baseline** (before / base sha / old path) against a **treatment** (after / head sha / new path) with the same measurement, the same environment and the same inputs.

## 1. Make the claim falsifiable

Rewrite it as: *`<metric or observable>` at `<treatment>` is `<relation>` than at `<baseline>` under `<conditions>`.* Examples:

- "p95 of `GET /orders?status=confirmed` at `HEAD` is ≤ 50% of `main` with the 10k-order seed, 20 warm requests, same machine."
- "For every fixture in `fixtures/parsers/*`, output at `HEAD` is byte-identical to `main`."
- "Submitting the dispatch modal twice at `HEAD` creates exactly one `dispatches` row (at `main` it created two)."

If you cannot write it in that shape, ask; do not measure a vague claim.

## 2. Fix the conditions

Same seed data, same env vars, same build mode, warm-up policy, N runs (perf: ≥ 5 per side, report median and p95, alternate sides to defeat drift), deterministic clock/time zone where relevant. Record all of it in `$VERIFY_RUN_DIR/conditions.md`.

## 3. Capture baseline and treatment

`node .agents/verify-kit/verify.mjs run-new --label claim` → `$VERIFY_RUN_DIR/baseline/` and `$VERIFY_RUN_DIR/treatment/`. Use worktrees for two shas. Capture raw artifacts (timings as CSV/JSON, traces, output files, DB dumps of the relevant rows), not summaries. For equivalence claims: characterization outputs from the baseline first, then diff the treatment against them.

## 4. Compare and decide

- PROVEN — the relation holds with margin (perf: medians and p95 both; equivalence: zero diffs).
- DISPROVEN — the relation fails.
- INCONCLUSIVE — noise exceeds the effect, or conditions could not be held equal. Say what would make it conclusive.

Write the comparison (`compare.md`) with the numbers side by side. A receipt is written against the feature the claim belongs to, `--status passed` only for PROVEN; DISPROVEN → `failed`; INCONCLUSIVE → `blocked` with the reason.

## 5. Report

Claim (falsifiable form) · conditions · baseline vs treatment numbers · verdict · artifacts. Never round a DISPROVEN into "mostly better".
