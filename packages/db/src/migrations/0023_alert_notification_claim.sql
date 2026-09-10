ALTER TABLE "alerts"
  ADD COLUMN IF NOT EXISTS "notification_claimed_until" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_notification_claim_idx"
  ON "alerts" ("status", "notification_claimed_until");
