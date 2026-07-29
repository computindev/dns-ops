ALTER TABLE "internal_cases"
  ADD COLUMN "version" integer DEFAULT 1 NOT NULL;

ALTER TABLE "internal_cases"
  ADD CONSTRAINT "internal_case_version_positive" CHECK ("version" > 0);
