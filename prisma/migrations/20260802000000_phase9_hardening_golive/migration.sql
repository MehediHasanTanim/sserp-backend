-- Phase 9: RLS, encryption keys, offline sync, hardening tables, blind index

ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "super_admin_ip_allowlist" JSONB,
  ADD COLUMN IF NOT EXISTS "two_factor_required_roles" JSONB NOT NULL DEFAULT '["super_admin"]',
  ADD COLUMN IF NOT EXISTS "feature_biometric_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "feature_payment_gateway_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "two_factor_recovery_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "disability_category_hash" TEXT;

CREATE INDEX IF NOT EXISTS "students_disability_category_hash_idx"
  ON "students" ("disability_category_hash");

DO $$ BEGIN
  CREATE TYPE "EncryptionPurpose" AS ENUM ('medical', 'financial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OfflineSyncEntityType" AS ENUM ('student_attendance', 'session_note', 'group_attendance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OfflineSyncStatus" AS ENUM ('accepted', 'partially_accepted', 'conflicted', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DataMigrationStatus" AS ENUM ('pending', 'dry_run', 'running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "encryption_keys" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key_version" INTEGER NOT NULL,
  "purpose" "EncryptionPurpose" NOT NULL,
  "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
  "wrapped_key" TEXT NOT NULL,
  "activated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "retired_at" TIMESTAMPTZ,
  "is_current" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "encryption_keys_purpose_key_version_key" UNIQUE ("purpose", "key_version")
);
CREATE INDEX IF NOT EXISTS "encryption_keys_purpose_is_current_idx"
  ON "encryption_keys" ("purpose", "is_current");

CREATE TABLE IF NOT EXISTS "data_migration_runs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "migration_name" TEXT NOT NULL,
  "source_description" TEXT,
  "status" "DataMigrationStatus" NOT NULL DEFAULT 'pending',
  "records_read" INTEGER NOT NULL DEFAULT 0,
  "records_written" INTEGER NOT NULL DEFAULT 0,
  "records_skipped" INTEGER NOT NULL DEFAULT 0,
  "records_failed" INTEGER NOT NULL DEFAULT 0,
  "error_report_object_key" TEXT,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "run_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "data_migration_runs_status_created_at_idx"
  ON "data_migration_runs" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "offline_sync_queue" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_batch_id" TEXT NOT NULL UNIQUE,
  "user_id" UUID NOT NULL,
  "entity_type" "OfflineSyncEntityType" NOT NULL,
  "payload" JSONB NOT NULL,
  "client_timestamp" TIMESTAMPTZ NOT NULL,
  "received_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "status" "OfflineSyncStatus" NOT NULL DEFAULT 'accepted',
  "conflict_report" JSONB,
  "result" JSONB
);
CREATE INDEX IF NOT EXISTS "offline_sync_queue_user_id_received_at_idx"
  ON "offline_sync_queue" ("user_id", "received_at");

CREATE TABLE IF NOT EXISTS "system_health_snapshots" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "captured_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "db_size_bytes" BIGINT,
  "active_connections" INTEGER,
  "redis_memory_bytes" BIGINT,
  "minio_usage_bytes" BIGINT,
  "queue_depths" JSONB,
  "slow_query_count" INTEGER
);
CREATE INDEX IF NOT EXISTS "system_health_snapshots_captured_at_idx"
  ON "system_health_snapshots" ("captured_at");

CREATE TABLE IF NOT EXISTS "audit_hash_checkpoints" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "from_seq" BIGINT NOT NULL,
  "to_seq" BIGINT NOT NULL,
  "chain_hash" TEXT NOT NULL,
  "row_count" INTEGER NOT NULL,
  "verified_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "audit_hash_checkpoints_to_seq_idx"
  ON "audit_hash_checkpoints" ("to_seq");

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'sserp_app') THEN
    ALTER ROLE sserp_app NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_user_id', true), '')::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION app_current_roles() RETURNS text AS $$
  SELECT COALESCE(current_setting('app.current_roles', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_has_role(role_name text) RETURNS boolean AS $$
  SELECT (
    ',' || COALESCE(current_setting('app.current_roles', true), '') || ','
  ) LIKE ('%,' || role_name || ',%');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_scoped_student_ids() RETURNS uuid[] AS $$
DECLARE
  raw text := COALESCE(current_setting('app.scoped_student_ids', true), '');
BEGIN
  IF raw IS NULL OR raw = '' THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  RETURN string_to_array(raw, ',')::uuid[];
EXCEPTION WHEN OTHERS THEN
  RETURN ARRAY[]::uuid[];
END;
$$ LANGUAGE plpgsql STABLE;

ALTER TABLE "student_medical_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_medical_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_medical_select ON "student_medical_records";
CREATE POLICY student_medical_select ON "student_medical_records"
  FOR SELECT USING (
    app_has_role('super_admin') OR app_has_role('principal') OR app_has_role('coordinator')
    OR (
      app_has_role('teacher') AND EXISTS (
        SELECT 1 FROM student_teacher_mappings stm
        WHERE stm.student_id = student_medical_records.student_id
          AND stm.is_active = true
      )
    )
    OR (
      app_has_role('parent') AND student_id = ANY (app_scoped_student_ids())
    )
  );
DROP POLICY IF EXISTS student_medical_write ON "student_medical_records";
CREATE POLICY student_medical_write ON "student_medical_records"
  FOR ALL USING (
    app_has_role('super_admin') OR app_has_role('coordinator')
  )
  WITH CHECK (
    app_has_role('super_admin') OR app_has_role('coordinator')
  );

ALTER TABLE "session_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_notes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_notes_access ON "session_notes";
CREATE POLICY session_notes_access ON "session_notes"
  FOR ALL USING (
    app_has_role('super_admin')
    OR app_has_role('coordinator')
    OR authored_by = app_current_user_id()
    OR supervisor_reviewed_by = app_current_user_id()
  )
  WITH CHECK (
    app_has_role('super_admin')
    OR app_has_role('coordinator')
    OR authored_by = app_current_user_id()
  );

ALTER TABLE "payroll_slips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_slips" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_slips_access ON "payroll_slips";
CREATE POLICY payroll_slips_access ON "payroll_slips"
  FOR SELECT USING (
    app_has_role('super_admin')
    OR app_has_role('hr_officer')
    OR app_has_role('accountant')
    OR employee_id IN (
      SELECT e.id FROM employees e
      JOIN users u ON u.employee_id = e.id
      WHERE u.id = app_current_user_id()
    )
  );
DROP POLICY IF EXISTS payroll_slips_write ON "payroll_slips";
CREATE POLICY payroll_slips_write ON "payroll_slips"
  FOR ALL USING (
    app_has_role('super_admin') OR app_has_role('hr_officer') OR app_has_role('accountant')
  )
  WITH CHECK (
    app_has_role('super_admin') OR app_has_role('hr_officer') OR app_has_role('accountant')
  );

ALTER TABLE "patient_medical_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_medical_history" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_medical_access ON "patient_medical_history";
CREATE POLICY patient_medical_access ON "patient_medical_history"
  FOR ALL USING (
    app_has_role('super_admin')
    OR app_has_role('coordinator')
    OR app_has_role('therapist')
  )
  WITH CHECK (
    app_has_role('super_admin')
    OR app_has_role('coordinator')
    OR app_has_role('therapist')
  );

ALTER TABLE "gratuity_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gratuity_payments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gratuity_payments_access ON "gratuity_payments";
CREATE POLICY gratuity_payments_access ON "gratuity_payments"
  FOR SELECT USING (
    app_has_role('super_admin')
    OR app_has_role('hr_officer')
    OR app_has_role('accountant')
    OR employee_id IN (
      SELECT e.id FROM employees e
      JOIN users u ON u.employee_id = e.id
      WHERE u.id = app_current_user_id()
    )
  );
DROP POLICY IF EXISTS gratuity_payments_write ON "gratuity_payments";
CREATE POLICY gratuity_payments_write ON "gratuity_payments"
  FOR ALL USING (
    app_has_role('super_admin') OR app_has_role('hr_officer') OR app_has_role('accountant')
  )
  WITH CHECK (
    app_has_role('super_admin') OR app_has_role('hr_officer') OR app_has_role('accountant')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sserp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sserp_app;
