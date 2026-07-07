-- Migration: 0013_findings_ruleset_version_fk_restrict
-- Summary: Switch the findings.ruleset_version_id FK from ON DELETE SET NULL
--          to ON DELETE RESTRICT.
--
-- Background:
-- The FK was created (0001) as ON DELETE SET NULL, but 0011 made the column
-- NOT NULL. A future DELETE on ruleset_versions would therefore try to SET
-- NULL a NOT NULL column and raise. RESTRICT makes the protection explicit:
-- a ruleset version referenced by any finding cannot be deleted until those
-- findings are removed first.
--
-- Idempotent: DROP IF EXISTS before re-adding.

ALTER TABLE "findings"
  DROP CONSTRAINT IF EXISTS "findings_ruleset_version_id_ruleset_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "findings"
  ADD CONSTRAINT "findings_ruleset_version_id_ruleset_versions_id_fk"
  FOREIGN KEY ("ruleset_version_id")
  REFERENCES "ruleset_versions"("id")
  ON DELETE restrict ON UPDATE no action;
