CREATE TYPE "domain_purpose" AS ENUM (
  'WEB', 'MAIL', 'WEB_AND_MAIL', 'REDIRECT', 'PARKED', 'UNKNOWN'
);
CREATE TYPE "domain_criticality" AS ENUM ('HIGH', 'NORMAL', 'LOW');

CREATE UNIQUE INDEX "domain_id_tenant_idx" ON "domains" ("id", "tenant_id");

CREATE TABLE "domain_profiles" (
  "domain_id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL,
  "purpose" "domain_purpose" DEFAULT 'UNKNOWN' NOT NULL,
  "responsible_actor_id" varchar(100),
  "criticality" "domain_criticality" DEFAULT 'NORMAL' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "domain_profile_domain_tenant_fk"
    FOREIGN KEY ("domain_id", "tenant_id")
    REFERENCES "domains" ("id", "tenant_id")
    ON DELETE CASCADE
);
CREATE INDEX "domain_profile_tenant_idx" ON "domain_profiles" ("tenant_id");
CREATE INDEX "domain_profile_purpose_idx" ON "domain_profiles" ("purpose");

ALTER TYPE "probe_type" ADD VALUE IF NOT EXISTS 'rdap';
