# Agent Instructions

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

## No Stubs or Placeholders Policy

**CRITICAL: This project does NOT allow stubs, placeholders, TODOs without implementation, or "mock" code.**

### What This Means

- ❌ **NEVER commit**: `// TODO: implement this`, `return null`, `throw new Error("not implemented")`
- ❌ **NEVER commit**: Mock functions that return hardcoded data instead of real implementation
- ❌ **NEVER commit**: Placeholder files with only exports but no actual logic
- ❌ **NEVER commit**: Database operations that return fake IDs instead of persisting

### If a Spec Is Unclear

**STOP and communicate immediately.** Do NOT proceed with guesses or stubs.

**Required workflow:**
1. Read the full specification in `beads/<name>.md`
2. If requirements are ambiguous, incomplete, or contradictory:
   - Document what is unclear
   - Propose a specific solution with rationale
   - Wait for confirmation before implementing

### What IS Allowed

- ✅ Temporary workarounds with `FIXME:` comments that include:
  - Specific trigger condition for replacement
  - Name of library/approach to use instead
  - Link to issue tracking the replacement

- ✅ Feature flags for gradual rollout (with clear on/off logic)
- ✅ Graceful degradation with explicit error messages to users

### Quality Gate

Before committing, verify:
1. Every function returns real data or a meaningful error
2. Database operations actually persist (not mock IDs)
3. API endpoints return real responses (not placeholders)
4. All error cases are handled explicitly (not `TODO: handle error`)

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## Agent Flywheel (NucBox)

- Repository: `dns-ops`
- Runtime markers: Bun
- Workbench control plane: not mapped; run `mde search dns-ops` before reporting project status
- Repository memory: `.cass/playbook.yaml`; keep rules project-specific.
- Git remains the code authority; Workbench is the coordination authority when mapped.

Before any non-trivial task:

```bash
TASK="describe the task"
cm context "$TASK" --workspace "$PWD" --json
cass search "$TASK" --workspace "$PWD" --days 90 --json --fields summary
```

Search Workbench with plain `mde search`, then read the exact document with `mde cat`.
Before committing, run `ubs --diff .` and `ubs --staged`.
Keep `dcg` active; explain blocks and prefer reversible alternatives.
Use `herdr --session dns-ops` for persistent remote agent work.
