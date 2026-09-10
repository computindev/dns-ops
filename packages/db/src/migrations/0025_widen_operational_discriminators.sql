ALTER TABLE "operational_condition_baselines"
  ALTER COLUMN "discriminator" TYPE varchar(512);
--> statement-breakpoint
ALTER TABLE "internal_signals"
  ALTER COLUMN "condition_key" TYPE varchar(1024);
