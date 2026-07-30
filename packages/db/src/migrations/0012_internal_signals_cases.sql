CREATE TYPE "internal_signal_kind" AS ENUM (
  'DOMAIN_EXPIRING_SOON',
  'TLS_CERTIFICATE_REGRESSION',
  'HTTP_ENDPOINT_UNAVAILABLE',
  'REDIRECT_TOPOLOGY_REGRESSION',
  'HOMEPAGE_INDEXABILITY_REGRESSION',
  'MAIL_DNS_CONFIGURATION_REGRESSION'
);
CREATE TYPE "internal_signal_status" AS ENUM ('ACTIVE', 'RESOLVED');
CREATE TYPE "internal_case_status" AS ENUM (
  'OPEN', 'ACKNOWLEDGED', 'BLOCKED', 'RESOLVED', 'DISMISSED'
);

CREATE TABLE "internal_signals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "domain_id" uuid NOT NULL REFERENCES "domains"("id") ON DELETE CASCADE,
  "kind" "internal_signal_kind" NOT NULL,
  "condition_key" varchar(500) NOT NULL,
  "status" "internal_signal_status" DEFAULT 'ACTIVE' NOT NULL,
  "first_seen_snapshot_id" uuid REFERENCES "snapshots"("id"),
  "last_seen_snapshot_id" uuid REFERENCES "snapshots"("id"),
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);
CREATE UNIQUE INDEX "internal_signal_tenant_condition_unique"
  ON "internal_signals" ("tenant_id", "condition_key");
CREATE INDEX "internal_signal_tenant_idx" ON "internal_signals" ("tenant_id");
CREATE INDEX "internal_signal_domain_idx" ON "internal_signals" ("domain_id");
CREATE INDEX "internal_signal_status_idx" ON "internal_signals" ("status");

CREATE TABLE "internal_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "signal_id" uuid NOT NULL REFERENCES "internal_signals"("id") ON DELETE CASCADE,
  "status" "internal_case_status" DEFAULT 'OPEN' NOT NULL,
  "disposition" text,
  "note" text,
  "acknowledged_at" timestamp with time zone,
  "acknowledged_by" varchar(100),
  "resolved_at" timestamp with time zone,
  "verification_snapshot_id" uuid REFERENCES "snapshots"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "internal_case_signal_unique" ON "internal_cases" ("signal_id");
CREATE INDEX "internal_case_tenant_idx" ON "internal_cases" ("tenant_id");
CREATE INDEX "internal_case_status_idx" ON "internal_cases" ("status");

CREATE TABLE "internal_case_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL REFERENCES "internal_cases"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL,
  "actor_id" varchar(100) NOT NULL,
  "from_status" "internal_case_status",
  "to_status" "internal_case_status" NOT NULL,
  "note" text,
  "disposition" text,
  "verification_snapshot_id" uuid REFERENCES "snapshots"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "internal_case_event_case_idx" ON "internal_case_events" ("case_id");
CREATE INDEX "internal_case_event_tenant_idx" ON "internal_case_events" ("tenant_id");

ALTER TABLE "alerts" ADD COLUMN "signal_id" uuid REFERENCES "internal_signals"("id");
CREATE UNIQUE INDEX "alert_signal_unique" ON "alerts" ("signal_id");
