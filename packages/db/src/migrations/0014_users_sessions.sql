-- Migration: 0014_users_sessions
-- Summary: Create the `users` and `sessions` tables (auth).
--
-- Background:
-- These tables are declared in the Drizzle schema (packages/db/src/schema/
-- index.ts) but were never backed by a migration, so the dynamic schema
-- manifest (verify-migrations) expected tables no migration created and CI
-- was red. Shape mirrors schema/index.ts exactly (no extra FKs/indexes beyond
-- what the schema declares, so drizzle-kit does not drift).
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "password_hash" text NOT NULL,
  "name" varchar(255),
  "tenant_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token" varchar(255) NOT NULL,
  "user_email" varchar(255) NOT NULL,
  "tenant_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_unique" ON "sessions" ("token");
