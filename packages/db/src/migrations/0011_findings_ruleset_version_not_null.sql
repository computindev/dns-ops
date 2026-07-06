-- Migration: 0011_findings_ruleset_version_not_null
-- Summary: Enforce NOT NULL on findings.ruleset_version_id.
--
-- Background:
-- findings.ruleset_version_id was created nullable (0000_nebulous_steve_rogers).
-- The web write-path (hono/routes/findings.ts) has always populated it, but the
-- collector's evaluateAndPersistFindings persisted findings WITHOUT it, leaving
-- real rows with NULL. This blocks TB-3, which needs the column non-null to
-- dedupe findings deterministically.
--
-- Strategy (matches the 0006_enforce_tenant_not_null precedent):
--   1. Backfill: every NULL row is assigned the active ruleset version's id
--      (most recently created active row when more than one is active).
--   2. Guard: fail descriptively if any NULL remains — only possible when NULL
--      rows exist AND there is no active ruleset_versions row to backfill from
--      (a misconfigured database that needs manual intervention, not a silent
--      guess).
--   3. Enforce: ALTER COLUMN ... SET NOT NULL.
--
-- Safety:
--   - On a fresh/empty database (no findings rows) the UPDATE is a 0-row no-op,
--     the guard passes, and the ALTER succeeds on an empty column — so this
--     migration is safe to run on brand-new environments.
--   - Idempotent for the data: UPDATE ... WHERE IS NULL touches nothing once no
--     NULLs remain. (The runner's _migrations_applied ledger additionally
--     guarantees the file executes at most once.)
--   - Runs inside the runner's per-file transaction; all three phases commit
--     atomically.
--
-- Out of scope (left to TB-3): findings.ruleset_version_id still carries
-- ON DELETE SET NULL on its FK; a future ruleset_versions delete would now
-- violate NOT NULL. Pre-existing behavior, unchanged here.

-- ============================================================================
-- PHASE 1: Backfill NULL rows to the active ruleset version
-- ============================================================================
-- Deterministic when multiple rows are active: pick the most recently created.
-- A subquery returning no rows yields NULL, but the WHERE clause confines the
-- UPDATE to rows that are already NULL — so on a database with no active
-- ruleset version the UPDATE is effectively a no-op and PHASE 2's guard
-- surfaces the problem instead of silently mis-assigning data.

UPDATE "findings"
SET "ruleset_version_id" = (
  SELECT "id" FROM "ruleset_versions"
  WHERE "active" = TRUE
  ORDER BY "created_at" DESC
  LIMIT 1
)
WHERE "ruleset_version_id" IS NULL;
--> statement-breakpoint

-- ============================================================================
-- PHASE 2: Guard — fail loudly if any NULL remains
-- ============================================================================
-- Only reachable when NULL findings rows exist AND there was no active
-- ruleset_versions row to backfill from. A human must resolve this (create or
-- activate a ruleset version), not the migration.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "findings" WHERE "ruleset_version_id" IS NULL) THEN
    RAISE EXCEPTION
      'Cannot enforce NOT NULL on findings.ruleset_version_id: NULL rows remain. '
      'Ensure at least one ruleset_versions row with active = TRUE exists, then re-run.';
  END IF;
END $$;
--> statement-breakpoint

-- ============================================================================
-- PHASE 3: Enforce NOT NULL
-- ============================================================================

ALTER TABLE "findings" ALTER COLUMN "ruleset_version_id" SET NOT NULL;
