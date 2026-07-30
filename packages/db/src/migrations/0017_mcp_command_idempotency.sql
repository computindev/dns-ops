CREATE TYPE "mcp_command_status" AS ENUM ('PENDING', 'COMPLETED');

CREATE TABLE "mcp_commands" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "actor_id" varchar(100) NOT NULL,
  "operation" varchar(100) NOT NULL,
  "idempotency_key" varchar(200) NOT NULL,
  "request_fingerprint" varchar(64) NOT NULL,
  "status" "mcp_command_status" DEFAULT 'PENDING' NOT NULL,
  "resource_id" uuid,
  "response" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
CREATE UNIQUE INDEX "mcp_command_tenant_operation_key_unique"
  ON "mcp_commands" ("tenant_id", "actor_id", "operation", "idempotency_key");
CREATE INDEX "mcp_command_tenant_idx" ON "mcp_commands" ("tenant_id");
