---
receipt: verification-receipt/v0
run_id: 20260901-003422Z-cfdc3f2-issue55-ttl-overflow
feature_id: domain.overview
profile: changed
surface: web
sha: cfdc3f25c5f040233edbb2182e9fd63ba9441edd
code_digest: 961eda71fd0d212e1eed13bad5fbf7ca9fc806b9716bb6ef8c2a561bb69bd08e
dirty: true
untracked: 0
status: blocked
reason: "No live database with a persisted snapshot containing public-recursive evidence in this environment (postgres absent), and live replay is outside this task's constraints, so harness live attestation cannot run. Overflow fix proven by 4 new fake-clock unit tests (Number.MAX_SAFE_INTEGER, Infinity overflow, exact 8.64e15 boundary in/out) plus the prior 17, full web unit suite (982 passed), fixed-clock Playwright E2E on the real UI (14 passed incl. 3 TTL countdown tests), typecheck and lint clean; live re-verification required where persisted evidence exists."
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260901-003422Z-cfdc3f2-issue55-ttl-overflow
created_at: 2026-09-01T00:34:28.300Z
---

# Receipt: domain.overview — blocked

> code_digest corrected post-issue: `verify.mjs workingTree()` (`git add -A` on a temp
> index) fails in this worktree because the tracked gitlink `.pi/self-learning-memory`
> has no checked-out commit, so the CLI fell back to HEAD's digest. The value above is
> the digest of the exact staged tree that was verified (matches `check-commit
> --staged`, computed with verify.mjs's own `globToRegex`/`matchAny` filter).

- estimateLiveAt now rejects candidate deadlines that are non-finite or outside the ±8.64e15 ms Date range (isUsableDeadline); oversized TTLs render UNKNOWN instead of crashing toISOString() on the Parsed view.
- Approved TTL semantics preserved: evidence only from matching successful public-recursive answers, exact deadline = valid 0, post-deadline stale, record.ttl never used.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260901-003422Z-cfdc3f2-issue55-ttl-overflow/env.txt | env | aux | 262d2ba3ebc06e01e34d5b1994546bc54f568c8df423a2f7c4a77076786ebf0a |
