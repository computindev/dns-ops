---
name: capture-learnings
description: >-
  After a verification run, a fresh review, or a task close, mine the session for high-signal, durable learnings and route them to the right home as proposed edits: feature-specific gotchas into the feature file's Gotchas section, repo-wide agent rules into AGENTS.md/CLAUDE.md's Verification block, kit-wide improvements into a note for verify-kit. Use when someone says "capture learnings", "what did we learn", "update the gotchas", "close the task", or at the end of any task where the agent hit a surprise, a flaky step, a wrong assumption, or a workaround. Proposes diffs only; the human applies or approves.
---

# Capture learnings

Inspired by Cursor's `continual-learning` (incremental, high-signal bullets only) and this studio's rule that agent findings are born *proposed*. One strange task must not become a permanent rule; one repeated surprise must not stay in a transcript.

## 1. Mine the session

Scan the current session (and the run's evidence) for signals worth keeping:

- a step that failed once and worked on retry (flakiness, timing, ordering)
- a precondition nobody wrote down (feature flag, seed state, entitlement, port)
- a selector, route or command that differed from the map
- a wrong assumption that cost more than five minutes
- a workaround that should become a proper harness helper or a product change
- a verification that was `blocked`/`unreachable` and what would unblock it

Discard: anything task-specific, anything already in the map, opinions, restated code.

## 2. Route each learning

| Learning is about | Goes to | Format |
|---|---|---|
| one feature's behavior, driving or proof | that feature file → `## Gotchas` | one bullet, imperative, with the concrete value (`wait for role=combobox enabled, not the modal`) |
| launching, doctor, cleanup, environment | `verify-<app>/SKILL.md` relevant section | edit in place, keep it exact |
| how agents should work in this repo | `AGENTS.md` / `CLAUDE.md` → **Verification** block | max 1 new bullet per task; merge with an existing bullet if it overlaps; keep the block under 15 bullets |
| the kit itself (scripts, templates, skills) | `verification/kit-notes.md` (append) | one line: what, why, suggested change |
| a product defect or missing observability (`data-action-id`, read-back) | a proposed issue/PR note, not the map | title + evidence path |

## 3. Output

A single proposed diff per file, plus a short list of what you discarded and why. Do not apply the AGENTS.md change yourself; apply feature-file gotchas only if the user has said proposed map edits are pre-approved for this repo. Never turn a `failed` verification into a gotcha — that is a bug, not a lesson.
