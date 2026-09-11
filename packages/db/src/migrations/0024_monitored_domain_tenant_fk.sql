-- Align monitored tenant_id to the owning domain when the monitor row is unscoped.
UPDATE "monitored_domains" AS m
SET "tenant_id" = d."tenant_id"
FROM "domains" AS d
WHERE m."domain_id" = d."id"
  AND m."tenant_id" IS NULL
  AND d."tenant_id" IS NOT NULL;
--> statement-breakpoint
-- Remove monitors whose domain is missing, unowned, or owned by a different tenant.
DELETE FROM "monitored_domains" AS m
WHERE NOT EXISTS (
  SELECT 1 FROM "domains" AS d WHERE d."id" = m."domain_id"
);
--> statement-breakpoint
DELETE FROM "monitored_domains" AS m
USING "domains" AS d
WHERE m."domain_id" = d."id"
  AND (d."tenant_id" IS NULL OR m."tenant_id" IS DISTINCT FROM d."tenant_id");
--> statement-breakpoint
DELETE FROM "monitored_domains"
WHERE "tenant_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "monitored_domains" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "monitored_domains"
    ADD CONSTRAINT "monitored_domain_domain_tenant_fk"
    FOREIGN KEY ("domain_id", "tenant_id")
    REFERENCES "domains" ("id", "tenant_id")
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
