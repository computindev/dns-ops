# DNS Ops — development procedures

Read the applicable sections before implementing a bead or committing changes. `AGENTS.md` is the shared entrypoint. All paths and commands below are relative to the repository root.

## Core Principle: No Stubs, No Placeholders

This codebase maintains a **strict no-stubs policy**. Every commit must contain working, tested, production-ready code. If you cannot implement something completely, you must:

1. **Communicate the blocker clearly**
2. **Propose a specific path forward**
3. **Wait for human/lead agent confirmation**

Never leave `TODO`, `FIXME` (without specific replacement plan), or mock implementations in committed code.

---

## When Requirements Are Unclear

### Step 1: Read the Bead Completely

```bash
# Show the full bead specification
bd show <bead-id> --json

# Read the markdown file directly
cat beads/<bead-name>.md
```

### Step 2: Identify Specific Ambiguities

Document exactly what is unclear:
- Missing technical specifications?
- Contradictory requirements?
- Undefined behavior for edge cases?
- Missing acceptance criteria?

### Step 3: Propose a Solution

Don't just ask questions—propose an answer:

**Bad:** "What should the timeout be?"

**Good:** "The bead doesn't specify DNS query timeout. I propose 5 seconds based on RFC 1035 recommendations. This balances responsiveness with slow authoritative servers. Confirm?"

### Step 4: Track the Clarification

```bash
# Create a clarification issue linked to the bead
bd create "Clarification: Timeout values for DNS queries" \
  --description="Proposed: 5s for recursive, 10s for authoritative..." \
  -p 1 \
  --deps discovered-from:dns-ops-e869
```

---

## Code Quality Standards

### Before Every Commit

Run this mental checklist:

```
□ Every function has a real implementation (no throw "not implemented")
□ Every database write actually persists (no mock IDs)
□ Every API returns real data or explicit error (no placeholder responses)
□ Error handling is complete (no TODO comments)
□ Types are accurate (no `any` without justification)
□ Relevant tests were actually run; record results and any remaining validation gap
```

### Allowed Temporary Workarounds

Only if they include all three elements:

```typescript
// FIXME: Replace with dns-packet when DNSSEC validation needed
// Trigger: When adding DNSSEC support (Bead 12)
// Issue: bd show dns-ops-pr29
const queryCAA = async () => {
  // Current: Limited CAA support via resolveAny
  // Future: Full CAA with dns-packet for parsing
}
```

---

## Working with Beads

### Dependency Order

Never start a bead until ALL its dependencies are closed:

```bash
# Check if ready
bd ready --json

# If blocked, the dependency will be listed
bd show <bead-id> --json | jq '.dependencies'
```

### Parallel Work

Some beads can be worked in parallel when dependencies are satisfied:

- **Bead 03** (DNS collector) and **Bead 04** (Domain 360 shell) → Can run in parallel
- **Bead 05** (Snapshot views) → Must wait for both 03 and 04

### Claiming Work

```bash
# Always claim before starting
bd update <bead-id> --claim --json

# If already claimed by another agent, find different work
bd ready --json
```

---

## Git Workflow

### Before Committing

1. **Check for lock files:**
   ```bash
   lsof .git/index.lock 2>/dev/null || echo "No lock"
   ```

2. **Stage changes:**
   ```bash
   git add <task-owned-paths>
   git diff --cached
   git status
   ```

3. **Verify remote exists:**
   ```bash
   git remote -v
   # If empty, ask user for remote URL
   ```

### Commit Messages

Follow the pattern:
```
Bead XX: Brief description

- Specific change 1
- Specific change 2
- Why it matters
```

Example:
```
Bead 03: DNS collection worker MVP

- Implemented DNSResolver using Node.js dns module
- Created DNSCollector with multi-vantage support
- API endpoint POST /api/collect/domain
- Returns real query results, not mocks
```

### Pushing

```bash
git pull --rebase
bd dolt push
git push
git status  # MUST show "up to date"
```

---

## Technical Architecture Context

### Monorepo Structure

```
apps/
  web/           # TanStack Start + Hono on Railway Node
  collector/     # Node.js DNS collection service (separate runtime)

packages/
  contracts/     # Shared TypeScript types/enums
  db/            # Drizzle ORM schema and repositories
  parsing/       # DNS/mail/IDN parsing utilities
  rules/         # Deterministic rules engine
  testkit/       # Benchmark corpus and test fixtures
```

### Critical Implementation Details

1. **Database:** PostgreSQL/Drizzle is authoritative. Schema changes run through `scripts/run-migrations.mjs`; request handlers never apply DDL. Read README migration setup before changing persistence
2. **DNS Collection:** Node.js native `dns` module has limitations—document when using
3. **Zone Management:** Unmanaged zones get "targeted inspection only" (not full enumeration)
4. **Rules Engine:** Deterministic only—no AI-generated findings allowed

### Common Pitfalls

| Pitfall | Prevention |
|---------|------------|
| Returning mock snapshot IDs | Actually wire up `@dns-ops/db` before committing collector |
| Using `any` types | Define proper interfaces in `contracts` package |
| Forgetting error handling | Every async operation needs try/catch with specific error messages |
| Incomplete record type support | Document limitations and FIXME with upgrade path |
| Git index.lock issues | Check `lsof` before force-removing |

---

## Communication Template

When you need clarification:

```markdown
**Bead:** [Name and ID]

**Clarification Needed:**
[Specific question with context]

**Proposed Solution:**
[Your recommendation with rationale]

**Impact if Deferred:**
[What gets blocked or delayed]

**Recommendation:**
[Proceed with proposal / Wait for confirmation]
```

---

## Quick Reference Commands

```bash
# Find available work
bd ready --json

# Claim a bead
bd update <id> --claim --json

# Close completed work
bd close <id> --reason "Detailed completion note"

# Check bead dependencies
bd show <id> --json | jq '.dependencies'

# Typecheck all packages
bun run typecheck

# Build all packages
bun run build
```

---

## Remember

> **"If you can't implement it completely, don't commit it."**

Communicate blockers early. Propose solutions. Wait for confirmation.

The quality of this codebase depends on every agent following this principle.

## Verification

Follow `AGENTS.md` → Verification and `.agents/skills/verify-dns-ops/` before user-facing work. Keep one verification policy; this procedure does not redefine it.

The local quality commands are `bun run lint`, `bun run typecheck`, `bun run test`
and `bun run build`. Read README Validation before E2E, smoke or live-DNS checks;
their service, credential and provider prerequisites differ. A green local check
does not prove a live journey or authorize a provider write/deployment.
