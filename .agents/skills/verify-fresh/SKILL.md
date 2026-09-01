---
name: verify-fresh
description: >-
  Independent verification of a finished change by a fresh agent that did not implement it, at the exact committed sha, through the real surface, producing receipts with verifier=fresh. Use for any feature with profile critical or release (auth, money, permissions, tenant isolation, provider writes, irreversible data changes), whenever check-ci reports "requires verifier: fresh", when someone says "fresh verifier", "independent verification", "verify this PR", or before merging anything the builder self-verified. Must run with clean context — in pi, call the verify_fresh tool (it spawns an isolated pi in a worktree and follows this skill); elsewhere, a new session or subagent.
---

# Fresh verifier protocol

You are the verifier, not the builder. You have never seen this change being made and you must keep it that way: do **not** read the builder's summary, chat transcript, or PR description prose before you have formed your own verdict. Your inputs are the repository at an exact sha, the feature map, and the task's *Done means* block. Adapted from the fresh-reviewer contract used in this studio and pstack's separate-verifier principle.

## Inputs (all required)

- `HEAD_SHA` — the exact commit to verify (never a branch name).
- Feature ids to verify — from `node .agents/verify-kit/verify.mjs check-ci --base <base> --head <sha>` or from the task.
- The *Done means* block of the task (observable results, side effects, forbidden behavior, preserved behavior).
- The feature files under `.agents/skills/verify-<app>/features/`.

## Procedure

1. **Isolate.** `git worktree add ../verify-<sha7> <HEAD_SHA>` (or a fresh clone/sandbox). Install dependencies from lockfile. Never verify the builder's working tree.
2. **Run id.** `node .agents/verify-kit/verify.mjs run-new --label fresh` in the worktree; export `VERIFY_RUN_DIR`.
3. **Launch + Doctor** exactly as `verify-<app>/SKILL.md` says. If Doctor fails and you cannot fix the environment without touching product code, stop with `blocked` receipts and the doctor output as evidence.
4. **Drive every required feature** through the surface the change affects, covering every entry point the feature file lists. For bugs: reproduce first at the base sha if the task requires it, then confirm the reproduction no longer occurs at `HEAD_SHA` on the same interface.
5. **Evaluate all three oracle classes** from the feature file and the Done-means block: expected observations, forbidden observations, read-back through an independent path (API, DB, outbox, filesystem). A UI toast is not a read-back.
6. **Adversarial pass** (critical only, 10 minutes max): duplicate submission → idempotent or rejected; another tenant/user → cannot read or mutate; malformed input → clean error, no partial write; interrupted flow → no dangling state; relevant permission negative from the feature file.
7. **Receipts.** One per feature: `node .agents/verify-kit/verify.mjs receipt --run <id> --feature <id> --status <s> --verifier fresh --session "<harness>:<session id>" --notes-file <observations.md>`. Fill observations with concrete values seen, not adjectives.
8. **Cleanup** what you started (processes, disposable tenant). Then, depending on who launched you:
   - **Launched by the `verify_fresh` tool** (the prompt says the caller collects receipts and evidence, or a `.verify-fresh-worktree` marker exists in cwd): do **not** copy anything out and do **not** remove the worktree. Stop after the verdict.
   - **Launched manually**: `git worktree remove` deletes `verification/runs/` with it, so first `cp -R <worktree>/verification/runs/<run_id> <main checkout>/verification/runs/` and `cp <worktree>/verification/receipts/<run_id>--* <main checkout>/verification/receipts/`, commit the receipts on the PR branch (a receipts-only commit does not change the `code_digest`), and only then `git worktree remove`.
9. **Verdict** in this exact shape:

```
VERDICT: PASS | FAIL | BLOCKED
sha: <HEAD_SHA>
features: <id>=<status> ...
receipts: <paths>
not verified: <entry points / variants you could not reach, and why>
```

Only after writing the verdict may you read the builder's summary — and only to list discrepancies between what it claims and what you observed.

## Status semantics

`passed` = every expected observation seen, every forbidden observation absent, read-back consistent. `failed` = the flow completed but an oracle did not hold, or the flow could not complete because of the code. `blocked` = environment/entitlement prevented the attempt (say what). `unreachable` = the path cannot run on this executor (say which). `not_applicable` = the change does not touch this entry point (say why). No `skipped`. `blocked` and `unreachable` are not passes; policy decides whether they are acceptable for the profile.

## What invalidates your receipts

Any change to the code tree after verification (new commit, amend, rebase that alters content, feature-map edit) or a relevant environment change. A receipt is bound to the exact code tree (`code_digest`), not to a branch; a rebase that keeps the tree identical keeps the receipt valid.
