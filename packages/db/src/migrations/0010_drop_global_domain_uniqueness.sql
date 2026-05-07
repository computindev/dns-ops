-- Repair legacy single-column domain uniqueness so domains are tenant-scoped.
-- Idempotent when no duplicate non-null (normalized_name, tenant_id) rows exist.

ALTER TABLE "domains" DROP CONSTRAINT IF EXISTS "domains_name_key";
--> statement-breakpoint
DROP INDEX IF EXISTS "domain_name_idx";
--> statement-breakpoint
DO $$
DECLARE
  duplicate_rows text;
BEGIN
  SELECT string_agg(
    format('normalized_name=%s tenant_id=%s count=%s', normalized_name, tenant_id, row_count),
    '; '
  )
  INTO duplicate_rows
  FROM (
    SELECT normalized_name, tenant_id, COUNT(*) AS row_count
    FROM "domains"
    WHERE "tenant_id" IS NOT NULL
    GROUP BY "normalized_name", "tenant_id"
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_rows IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot create domain_name_tenant_idx: duplicate tenant-scoped domain rows exist: %', duplicate_rows;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "domain_name_tenant_idx"
  ON "domains" ("normalized_name", "tenant_id");
