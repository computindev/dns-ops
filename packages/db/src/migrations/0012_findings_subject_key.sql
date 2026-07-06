-- Migration: 0012_findings_subject_key
-- Summary: Add findings.subject_key and extend the finding uniqueness index to
--          (snapshot_id, rule_id, type, subject_key, ruleset_version_id).
--
-- Background:
-- TB-3 makes rules emit EVERY instance of a problem (the three DNS rules used to
-- compute all problems then `return findings[0]`). Two findings from the SAME
-- rule can now legitimately share (snapshot_id, rule_id, type, ruleset_version_id)
-- — e.g. one authoritative-mismatch rule surfacing inconsistency for two
-- different record sets. The old finding_unique_idx on
-- (snapshot_id, rule_id, type, ruleset_version_id) would reject the second
-- insert. subject_key is the rule-defined discriminator for WHAT the finding is
-- about (query name|type for DNS, CNAME owner, DKIM selector, a bounded hash for
-- CAA, '' for domain-level singletons), so two findings from one rule coexist
-- AND dedupe correctly when they describe the same subject.
--
-- Strategy (mirrors the 0006/0011 guard-before-constrain precedent):
--   1. ADD COLUMN subject_key (nullable, so the backfill UPDATE is allowed).
--   2. Backfill every existing row to '' (all legacy findings are domain-level
--      singletons relative to the new key — they predate subject_key).
--   3. Dedupe any rows that collide under the NEW composite key BEFORE building
--      the unique index. In a clean post-0011 database the old index already
--      guarantees no two rows share (snapshot_id, rule_id, type,
--      ruleset_version_id), so backfilling '' creates zero collisions and this
--      step is a no-op. It exists as a safety net for databases whose old
--      dedupe was impaired (e.g. historical NULL ruleset_version_id rows that
--      0011 collapsed onto the same version, or a restored/partial state).
--      Survivor policy (deterministic): acknowledged_at NOT NULL first, then
--      false_positive = TRUE, then earliest created_at, then smallest id.
--      Acknowledgement / false-positive state therefore ALWAYS survives the
--      re-key. Suggestions linked to loser rows are RE-LINKED to the survivor
--      (preserved, not cascade-deleted) BEFORE the losers are removed.
--   4. Guard: fail if any NULL subject_key remains.
--   5. Enforce NOT NULL.
--   6. Replace the uniqueness index: DROP the old finding_unique_idx, CREATE the
--      new one with subject_key. IF EXISTS keeps this idempotent against
--      databases where the old index was already dropped.
--
-- Safety:
--   - Fresh/empty database: every UPDATE/DELETE is a 0-row no-op, the guard
--     passes on an empty column, and ALTER/CREATE succeed — safe on brand-new
--     environments.
--   - Idempotent for data: backfill + dedupe touch nothing once stable. The
--     runner's _migrations_applied ledger additionally guarantees the file
--     executes at most once.
--   - Each --> statement-breakpoint chunk is self-contained (valid whether the
--     runner sends the whole file as one batch, as scripts/run-migrations.mjs
--     does, or splits on the marker, as packages/db/scripts/verify-migrations.ts
--     does).

-- ============================================================================
-- PHASE 1: Add the column (nullable so the backfill can run)
-- ============================================================================

ALTER TABLE "findings" ADD COLUMN "subject_key" varchar(320);
--> statement-breakpoint

-- ============================================================================
-- PHASE 2: Backfill legacy rows to '' (domain-level singletons)
-- ============================================================================

UPDATE "findings" SET "subject_key" = '' WHERE "subject_key" IS NULL;
--> statement-breakpoint

-- ============================================================================
-- PHASE 3a: Dedupe — re-link suggestions from losers to the surviving finding
-- ============================================================================
-- Same survivor ordering as 3b: (acknowledged_at IS NOT NULL) DESC,
-- (false_positive = TRUE) DESC, created_at ASC, id ASC. Recomputed here so this
-- chunk is self-contained. Only groups with >1 row are affected; clean data is a
-- no-op. Losers' suggestions are moved onto the survivor so no suggestion data is
-- lost when the losers are deleted in 3b.

WITH "ranked" AS (
  SELECT
    "id",
    "snapshot_id", "rule_id", "type", "subject_key", "ruleset_version_id",
    ROW_NUMBER() OVER (
      PARTITION BY "snapshot_id", "rule_id", "type", "subject_key", "ruleset_version_id"
      ORDER BY
        ("acknowledged_at" IS NOT NULL) DESC,
        ("false_positive" = TRUE) DESC,
        "created_at" ASC,
        "id" ASC
    ) AS "rn"
  FROM "findings"
)
UPDATE "suggestions"
SET "finding_id" = "survivor"."id"
FROM "ranked" AS "loser"
JOIN "ranked" AS "survivor"
  ON  "loser"."snapshot_id"        = "survivor"."snapshot_id"
  AND "loser"."rule_id"            = "survivor"."rule_id"
  AND "loser"."type"               = "survivor"."type"
  AND "loser"."subject_key"        = "survivor"."subject_key"
  AND "loser"."ruleset_version_id" = "survivor"."ruleset_version_id"
  AND "survivor"."rn" = 1
WHERE "suggestions"."finding_id" = "loser"."id"
  AND "loser"."rn" > 1;
--> statement-breakpoint

-- ============================================================================
-- PHASE 3b: Dedupe — delete the loser rows (ack/FP state preserved on survivor)
-- ============================================================================

WITH "ranked" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "snapshot_id", "rule_id", "type", "subject_key", "ruleset_version_id"
      ORDER BY
        ("acknowledged_at" IS NOT NULL) DESC,
        ("false_positive" = TRUE) DESC,
        "created_at" ASC,
        "id" ASC
    ) AS "rn"
  FROM "findings"
)
DELETE FROM "findings"
WHERE "id" IN (SELECT "id" FROM "ranked" WHERE "rn" > 1);
--> statement-breakpoint

-- ============================================================================
-- PHASE 4: Guard — fail loudly if any NULL subject_key remains
-- ============================================================================
-- Only reachable if some row escaped the backfill. A human must resolve it, not
-- the migration.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "findings" WHERE "subject_key" IS NULL) THEN
    RAISE EXCEPTION
      'Cannot enforce NOT NULL on findings.subject_key: NULL rows remain after backfill.';
  END IF;
END $$;
--> statement-breakpoint

-- ============================================================================
-- PHASE 5: Enforce NOT NULL
-- ============================================================================

ALTER TABLE "findings" ALTER COLUMN "subject_key" SET NOT NULL;
--> statement-breakpoint

-- ============================================================================
-- PHASE 6: Replace the uniqueness index
-- ============================================================================
-- DROP the old (snapshot_id, rule_id, type, ruleset_version_id) index — it would
-- reject the legitimate multi-finding inserts TB-3 now produces — and CREATE the
-- new one keyed on subject_key. IF EXISTS keeps this idempotent.

DROP INDEX IF EXISTS "finding_unique_idx";
--> statement-breakpoint

CREATE UNIQUE INDEX "finding_unique_idx"
  ON "findings" ("snapshot_id", "rule_id", "type", "subject_key", "ruleset_version_id");
