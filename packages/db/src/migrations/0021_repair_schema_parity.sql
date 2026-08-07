-- RT-4: fold request-time repairSchema columns into the release migration path.
-- All statements are idempotent (IF NOT EXISTS) so re-application is safe if an
-- environment previously received these columns via repairSchema.

ALTER TABLE shared_reports ADD COLUMN IF NOT EXISTS description TEXT;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true;
--> statement-breakpoint
ALTER TABLE record_sets ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS effort VARCHAR(20) DEFAULT 'medium';
--> statement-breakpoint
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 50;
--> statement-breakpoint
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT false;
--> statement-breakpoint
ALTER TABLE fleet_reports ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE probe_observations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS target_type VARCHAR(50);
--> statement-breakpoint
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS target_id UUID;
--> statement-breakpoint
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE domain_tags ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
