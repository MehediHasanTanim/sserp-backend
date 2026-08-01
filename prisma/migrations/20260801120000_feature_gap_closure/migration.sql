-- Feature gap closure: password expiry, recurrence count, HR penalties, biometric id, payment intents

ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "password_max_age_days" INTEGER,
  ADD COLUMN IF NOT EXISTS "late_penalty_per_minute" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "early_leave_penalty_per_minute" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "attendance_anomaly_late_streak_days" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "therapy_recurrences"
  ADD COLUMN IF NOT EXISTS "end_after_sessions" INTEGER;

ALTER TABLE "hr_attendance"
  ADD COLUMN IF NOT EXISTS "early_leave_minutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "penalty_amount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "biometric_device_user_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "employees_biometric_device_user_id_key"
  ON "employees"("biometric_device_user_id");

CREATE TABLE IF NOT EXISTS "payment_gateway_intents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "gateway_txn_id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "invoice_id" UUID,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMP(3),

  CONSTRAINT "payment_gateway_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_gateway_intents_gateway_txn_id_key"
  ON "payment_gateway_intents"("gateway_txn_id");

CREATE INDEX IF NOT EXISTS "payment_gateway_intents_invoice_id_idx"
  ON "payment_gateway_intents"("invoice_id");

CREATE INDEX IF NOT EXISTS "payment_gateway_intents_status_idx"
  ON "payment_gateway_intents"("status");
