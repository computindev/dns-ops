ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'operational_baseline_accepted';

CREATE TABLE "operational_condition_baselines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "domain_id" uuid NOT NULL,
  "kind" "internal_signal_kind" NOT NULL,
  "discriminator" varchar(64) NOT NULL,
  "source_snapshot_id" uuid NOT NULL REFERENCES "snapshots"("id"),
  "policy" jsonb NOT NULL,
  "max_evidence_age_seconds" integer NOT NULL,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "accepted_by" varchar(100) NOT NULL,
  "superseded_at" timestamp with time zone,
  "superseded_by" varchar(100),
  CONSTRAINT "operational_baseline_domain_tenant_fk"
    FOREIGN KEY ("domain_id", "tenant_id")
    REFERENCES "domains" ("id", "tenant_id")
    ON DELETE CASCADE,
  CONSTRAINT "operational_baseline_max_evidence_age_positive"
    CHECK ("max_evidence_age_seconds" > 0)
);
CREATE UNIQUE INDEX "operational_baseline_active_condition_unique"
  ON "operational_condition_baselines" ("tenant_id", "domain_id", "kind", "discriminator")
  WHERE "superseded_at" IS NULL;
CREATE INDEX "operational_baseline_tenant_idx" ON "operational_condition_baselines" ("tenant_id");
CREATE INDEX "operational_baseline_snapshot_idx" ON "operational_condition_baselines" ("source_snapshot_id");

CREATE FUNCTION prevent_operational_baseline_rewrite() RETURNS trigger AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.domain_id IS DISTINCT FROM NEW.domain_id
    OR OLD.kind IS DISTINCT FROM NEW.kind
    OR OLD.discriminator IS DISTINCT FROM NEW.discriminator
    OR OLD.source_snapshot_id IS DISTINCT FROM NEW.source_snapshot_id
    OR OLD.policy IS DISTINCT FROM NEW.policy
    OR OLD.max_evidence_age_seconds IS DISTINCT FROM NEW.max_evidence_age_seconds
    OR OLD.accepted_at IS DISTINCT FROM NEW.accepted_at
    OR OLD.accepted_by IS DISTINCT FROM NEW.accepted_by
    OR OLD.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'accepted operational baselines are immutable';
  END IF;
  IF NEW.superseded_at IS NULL OR NEW.superseded_by IS NULL THEN
    RAISE EXCEPTION 'operational baseline supersession requires timestamp and actor';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER operational_baseline_immutable_update
  BEFORE UPDATE ON "operational_condition_baselines"
  FOR EACH ROW EXECUTE FUNCTION prevent_operational_baseline_rewrite();

CREATE FUNCTION prevent_operational_baseline_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'accepted operational baselines cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER operational_baseline_immutable_delete
  BEFORE DELETE ON "operational_condition_baselines"
  FOR EACH ROW EXECUTE FUNCTION prevent_operational_baseline_delete();
