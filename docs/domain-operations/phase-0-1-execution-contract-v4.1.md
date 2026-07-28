# DNS Ops — Lean Phase 0–1 Execution Contract V4.1

This file is the canonical entrypoint for the approved execution contract.

The complete contract is stored in four ordered parts. **All four parts together are authoritative** and must be read before implementation:

1. [`phase-0-1/01-outcome-budget-scope.md`](./phase-0-1/01-outcome-budget-scope.md)
2. [`phase-0-1/02-correctness-remediation-operations.md`](./phase-0-1/02-correctness-remediation-operations.md)
3. [`phase-0-1/03-seeded-tests-and-mcp.md`](./phase-0-1/03-seeded-tests-and-mcp.md)
4. [`phase-0-1/04-review-gates-and-agent-prompt.md`](./phase-0-1/04-review-gates-and-agent-prompt.md)

Supporting execution artifacts:

- [`controlled-test-assets-runbook-v4.1.md`](./controlled-test-assets-runbook-v4.1.md)
- [`day-0-worksheet.md`](./day-0-worksheet.md)

## Authority rule

The implementation agent must not reopen decisions marked closed in Part 1. The hard caps are authoritative:

- 15 focused engineering days;
- three calendar weeks;
- 24 founder hours.

The long-term product thesis in [`product-and-mcp-discussion-brief.md`](./product-and-mcp-discussion-brief.md) is context only and does not expand Phase 0–1 scope.
