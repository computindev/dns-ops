-- Repair legacy single-column domain uniqueness so domains are tenant-scoped.
-- Idempotent when no duplicate non-null (normalized_name, tenant_id) rows exist.

ALTER TABLE "domains" DROP CONSTRAINT IF EXISTS "domains_name_key";

DROP INDEX IF EXISTS "domain_name_idx";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "domains"
    WHERE "tenant_id" IS NOT NULL
    GROUP BY "normalized_name", "tenant_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create domain_name_tenant_idx: duplicate tenant-scoped domain rows exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "domain_name_tenant_idx"
  ON "domains" ("normalized_name", "tenant_id");
