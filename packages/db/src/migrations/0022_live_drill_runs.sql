-- Issue #62: two-person-confirmed starts of the fail-closed controlled-live
-- harness for the allowlisted asorin.ai tuples. drill_runs is the durable
-- approval/run trail; a partial unique index enforces a single open drill
-- (requested/approved/started) at any time so fault phases cannot overlap.

CREATE TABLE IF NOT EXISTS "drill_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "record_name" varchar(253) NOT NULL,
  "mutation_id" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'requested',
  "requester_actor" varchar(100) NOT NULL,
  "confirmer_actor" varchar(100),
  "recovery_artifact" text,
  "runner_message" text,
  "tenant_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drill_run_tenant_idx" ON "drill_runs" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drill_run_mutation_idx" ON "drill_runs" ("mutation_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drill_run_open_unique" ON "drill_runs" ((1)) WHERE "status" IN ('requested', 'approved', 'started');
--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'live_drill_requested';
--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'live_drill_confirmed';
--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'live_drill_started';
