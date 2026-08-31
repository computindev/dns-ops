# Task template — "Done means"

Paste into the task/issue/prompt. A task without a *Done means* block is not ready for an agent.

```
Implement <requested behavior>.

Affected features: <feature ids from .agents/skills/verify-<app>/features/README.md>
Profile: <changed | critical>

Done means:
- <observable expected result, through the real surface>;
- <secondary state or side effect, read back through an independent path>;
- <forbidden behavior that must not occur>;
- <existing behavior that must remain unchanged>;
- verification runs through <web | API | CLI | worker>;
- evidence includes <screenshots / trace / HTTP exchanges / DB or outbox read-back / generated files>;
- blocked, unreachable or inconclusive verification is reported explicitly and is not a pass.

Before starting: node .agents/verify-kit/verify.mjs start --features <ids> [--profile critical]
The implementing agent may run the verify skill to self-check and must write receipts for every affected feature.
For profile critical: a fresh verifier (pi: verify_fresh tool; else the verify-fresh skill in a clean session) must prove the final commit before merge.
```

Example (the difference between a task and a wish):

```
Add filter persistence in the orders inbox.

Affected features: inbox.filter, inbox.list
Profile: changed

Done means:
- changing the status filter updates the visible result set (data-state="inbox-filtered");
- reloading the page preserves the selected filter (read-back: GET /api/me/preferences → inbox.filter);
- a second browser session on the same workspace reads the same persisted value;
- table sorting is unchanged (existing inbox.list receipt still passes);
- verification runs through the web UI with API read-back;
- evidence includes trace, screenshots before/after reload, preferences read-back;
- if the second-session check cannot run on this executor, the receipt says unreachable, not passed.
```
