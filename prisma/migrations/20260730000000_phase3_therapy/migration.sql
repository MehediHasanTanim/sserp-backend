-- Phase 3: Therapy Module Migration

-- Enable btree_gist for exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Therapy enums
CREATE TYPE "ConsentType" AS ENUM ('therapy', 'media', 'data_sharing');

CREATE TYPE "TherapyType" AS ENUM ('ot', 'speech', 'aba', 'music', 'dance', 'assessment', 'physiotherapy', 'psychology', 'other');
CREATE TYPE "SessionMode" AS ENUM ('individual', 'group');
CREATE TYPE "SessionStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE "SessionCreatedFrom" AS ENUM ('main', 'patient_profile', 'therapist_profile', 'group', 'recurrence_job');
CREATE TYPE "SessionNoteStatus" AS ENUM ('draft', 'final', 'co_signed');
CREATE TYPE "PatientStatus" AS ENUM ('active', 'discharged', 'on_hold', 'waitlisted');
CREATE TYPE "LicenseStatus" AS ENUM ('valid', 'expiring', 'expired');
CREATE TYPE "ReferralSource" AS ENUM ('self', 'doctor', 'school', 'other');
CREATE TYPE "TherapyGroupStatus" AS ENUM ('active', 'closed');
CREATE TYPE "GroupMembershipState" AS ENUM ('active', 'waitlisted', 'exited');
CREATE TYPE "GroupChangeType" AS ENUM ('membership_added', 'membership_removed', 'therapist_changed', 'schedule_changed', 'status_changed');
CREATE TYPE "RecurrencePattern" AS ENUM ('daily', 'weekly', 'biweekly', 'monthly');
CREATE TYPE "RecurrenceStatus" AS ENUM ('active', 'ended', 'cancelled');
CREATE TYPE "GroupAttendanceStatus" AS ENUM ('present', 'absent', 'late', 'excused');
CREATE TYPE "WaitingListStatus" AS ENUM ('waiting', 'offered', 'scheduled', 'cancelled');
CREATE TYPE "TreatmentPlanStatus" AS ENUM ('draft', 'active', 'under_review', 'archived');
CREATE TYPE "TreatmentGoalType" AS ENUM ('short_term', 'long_term');
CREATE TYPE "TherapyBillingType" AS ENUM ('per_session', 'monthly_consolidated');
CREATE TYPE "TherapyInvoiceStatus" AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'waived', 'cancelled');
CREATE TYPE "TherapyPaymentStatus" AS ENUM ('recorded', 'reversed');

-- Therapists
CREATE TABLE "therapists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "license_number" TEXT,
    "availability_notes" TEXT,
    "contract_end_date" DATE,
    "supports_supervision" BOOLEAN NOT NULL DEFAULT false,
    "supervisor_therapist_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "therapists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "therapists_employee_id_key" ON "therapists"("employee_id");

ALTER TABLE "therapists" ADD CONSTRAINT "therapists_supervisor_therapist_id_fkey"
    FOREIGN KEY ("supervisor_therapist_id") REFERENCES "therapists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Therapist specializations
CREATE TABLE "therapist_specializations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "therapy_type" "TherapyType" NOT NULL,
    "supports_group" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "therapist_specializations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "therapist_specializations_therapist_id_therapy_type_key"
    ON "therapist_specializations"("therapist_id", "therapy_type");

ALTER TABLE "therapist_specializations" ADD CONSTRAINT "therapist_specializations_therapist_id_fkey"
    FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Therapist licenses
CREATE TABLE "therapist_licenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "license_type" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "issuing_authority" TEXT NOT NULL,
    "issued_date" DATE NOT NULL,
    "expiry_date" DATE,
    "attachment_id" UUID,
    "status" "LicenseStatus" NOT NULL DEFAULT 'valid',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "therapist_licenses_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "therapist_licenses" ADD CONSTRAINT "therapist_licenses_therapist_id_fkey"
    FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Therapist availability
CREATE TABLE "therapist_availability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapist_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    CONSTRAINT "therapist_availability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "therapist_availability_day_check" CHECK ("day_of_week" BETWEEN 0 AND 6)
);

ALTER TABLE "therapist_availability" ADD CONSTRAINT "therapist_availability_therapist_id_fkey"
    FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Patients
CREATE TABLE "patients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_code" TEXT NOT NULL,
    "student_id" UUID,
    "full_name" TEXT,
    "date_of_birth" DATE,
    "gender" TEXT,
    "guardian_name" TEXT,
    "guardian_relation" TEXT,
    "guardian_phone" TEXT,
    "guardian_email" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "photo_attachment_id" UUID,
    "insurance_provider" TEXT,
    "insurance_policy_number" TEXT,
    "panel_details" JSON,
    "status" "PatientStatus" NOT NULL DEFAULT 'active',
    "referral_source_on_create" TEXT,
    "discharge_date" DATE,
    "discharge_reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "patients_patient_code_key" ON "patients"("patient_code");

-- Patient medical history
CREATE TABLE "patient_medical_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "existing_conditions" JSON,
    "medications" JSON,
    "allergies" JSON,
    "past_therapy_history" TEXT,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "patient_medical_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "patient_medical_history_patient_id_key" ON "patient_medical_history"("patient_id");

ALTER TABLE "patient_medical_history" ADD CONSTRAINT "patient_medical_history_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Patient consents
CREATE TABLE "patient_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "consent_type" "ConsentType" NOT NULL,
    "attachment_id" UUID,
    "signed_by" UUID NOT NULL,
    "signed_date" DATE NOT NULL,
    "expiry_date" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patient_consents_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "patient_consents" ADD CONSTRAINT "patient_consents_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Referrals
CREATE TABLE "referrals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "referral_source" "ReferralSource" NOT NULL,
    "referrer_name" TEXT,
    "referrer_contact" TEXT,
    "referral_date" DATE NOT NULL,
    "referred_for_therapy_types" "TherapyType"[] NOT NULL DEFAULT '{}',
    "parent_referral_id" UUID,
    "attachment_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "referrals" ADD CONSTRAINT "referrals_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_parent_referral_id_fkey"
    FOREIGN KEY ("parent_referral_id") REFERENCES "referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Therapy groups
CREATE TABLE "therapy_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "therapy_type" "TherapyType" NOT NULL,
    "therapist_id" UUID NOT NULL,
    "description" TEXT,
    "max_capacity" INTEGER NOT NULL,
    "default_duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "status" "TherapyGroupStatus" NOT NULL DEFAULT 'active',
    "closed_at" TIMESTAMPTZ,
    "close_reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "therapy_groups_pkey" PRIMARY KEY ("id")
);

-- Group memberships
CREATE TABLE "group_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "enrollment_date" DATE NOT NULL,
    "exit_date" DATE,
    "exit_reason" TEXT,
    "state" "GroupMembershipState" NOT NULL DEFAULT 'active',
    "waitlist_position" INTEGER,
    "enrolled_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_memberships_active_unique" ON "group_memberships"("group_id", "patient_id") WHERE (state = 'active');

ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "therapy_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Group history
CREATE TABLE "group_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "change_type" "GroupChangeType" NOT NULL,
    "detail" JSON NOT NULL,
    "effective_date" DATE NOT NULL,
    "changed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "group_history" ADD CONSTRAINT "group_history_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "therapy_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Therapy recurrences
CREATE TABLE "therapy_recurrences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_mode" "SessionMode" NOT NULL,
    "therapist_id" UUID NOT NULL,
    "patient_id" UUID,
    "group_id" UUID,
    "therapy_type" "TherapyType" NOT NULL,
    "recurrence_pattern" "RecurrencePattern" NOT NULL,
    "day_of_week" INTEGER,
    "day_of_month" INTEGER,
    "start_time" TIME NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "room" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "RecurrenceStatus" NOT NULL DEFAULT 'active',
    "generated_until" DATE,
    "parent_recurrence_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "therapy_recurrences_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "therapy_recurrences" ADD CONSTRAINT "therapy_recurrences_therapist_id_fkey"
    FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "therapy_recurrences" ADD CONSTRAINT "therapy_recurrences_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "therapy_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "therapy_recurrences" ADD CONSTRAINT "therapy_recurrences_parent_recurrence_id_fkey"
    FOREIGN KEY ("parent_recurrence_id") REFERENCES "therapy_recurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Therapy sessions
CREATE TABLE "therapy_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_mode" "SessionMode" NOT NULL,
    "therapy_type" "TherapyType" NOT NULL,
    "therapist_id" UUID NOT NULL,
    "patient_id" UUID,
    "group_id" UUID,
    "recurrence_id" UUID,
    "recurrence_occurrence_index" INTEGER,
    "is_series_exception" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_start" TIMESTAMPTZ NOT NULL,
    "scheduled_end" TIMESTAMPTZ NOT NULL,
    "duration_minutes_planned" INTEGER NOT NULL,
    "duration_minutes_actual" INTEGER,
    "room" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'scheduled',
    "notes_instruction" TEXT,
    "cancellation_reason" TEXT,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ,
    "no_show_recorded_by" UUID,
    "assessment_patient_name" TEXT,
    "created_from" "SessionCreatedFrom" NOT NULL DEFAULT 'main',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "therapy_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "therapy_sessions_mode_check" CHECK (
        (session_mode = 'individual' AND group_id IS NULL) OR
        (session_mode = 'group' AND patient_id IS NULL AND group_id IS NOT NULL)
    ),
    CONSTRAINT "therapy_sessions_assessment_check" CHECK (
        therapy_type <> 'assessment' OR patient_id IS NOT NULL OR assessment_patient_name IS NOT NULL
    ),
    CONSTRAINT "therapy_sessions_end_after_start_check" CHECK (scheduled_end > scheduled_start)
);

-- GiST exclusion constraints for conflict prevention
ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_therapist_no_overlap"
    EXCLUDE USING gist (
        "therapist_id" WITH =,
        tstzrange("scheduled_start", "scheduled_end") WITH &&
    ) WHERE (status IN ('scheduled', 'in_progress'));

ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_room_no_overlap"
    EXCLUDE USING gist (
        "room" WITH =,
        tstzrange("scheduled_start", "scheduled_end") WITH &&
    ) WHERE (status IN ('scheduled', 'in_progress') AND room IS NOT NULL);

CREATE INDEX "therapy_sessions_therapist_start_idx" ON "therapy_sessions"("therapist_id", "scheduled_start");
CREATE INDEX "therapy_sessions_patient_start_idx" ON "therapy_sessions"("patient_id", "scheduled_start") WHERE patient_id IS NOT NULL;
CREATE INDEX "therapy_sessions_group_start_idx" ON "therapy_sessions"("group_id", "scheduled_start") WHERE group_id IS NOT NULL;
CREATE INDEX "therapy_sessions_scheduled_start_idx" ON "therapy_sessions"("scheduled_start");

ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_therapist_id_fkey"
    FOREIGN KEY ("therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "therapy_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_recurrence_id_fkey"
    FOREIGN KEY ("recurrence_id") REFERENCES "therapy_recurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Group session attendances
CREATE TABLE "group_session_attendances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "status" "GroupAttendanceStatus" NOT NULL DEFAULT 'present',
    "arrival_time" TIMESTAMPTZ,
    "individual_notes" TEXT,
    "marked_by" UUID NOT NULL,
    "marked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_session_attendances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_session_attendances_session_patient_key"
    ON "group_session_attendances"("session_id", "patient_id");

ALTER TABLE "group_session_attendances" ADD CONSTRAINT "group_session_attendances_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "therapy_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Session notes
CREATE TABLE "session_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "narrative" TEXT,
    "observations" TEXT,
    "interventions_used" JSON,
    "homework_assigned" TEXT,
    "authored_by" UUID NOT NULL,
    "authored_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supervisor_reviewed_by" UUID,
    "supervisor_reviewed_at" TIMESTAMPTZ,
    "supervisor_comment" TEXT,
    "status" "SessionNoteStatus" NOT NULL DEFAULT 'draft',
    CONSTRAINT "session_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "session_notes_session_patient_key" ON "session_notes"("session_id", "patient_id");

ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "therapy_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Session attachments
CREATE TABLE "session_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "patient_id" UUID,
    "attachment_id" UUID NOT NULL,
    "caption" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "session_attachments" ADD CONSTRAINT "session_attachments_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "therapy_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Therapy waiting list
CREATE TABLE "therapy_waiting_list" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "therapy_type" "TherapyType" NOT NULL,
    "preferred_therapist_id" UUID,
    "preferred_days" INTEGER[] NOT NULL DEFAULT '{}',
    "preferred_time_from" TIME,
    "preferred_time_to" TIME,
    "group_id" UUID,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "requested_date" DATE NOT NULL,
    "status" "WaitingListStatus" NOT NULL DEFAULT 'waiting',
    "offered_at" TIMESTAMPTZ,
    "offer_expires_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "therapy_waiting_list_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "therapy_waiting_list" ADD CONSTRAINT "therapy_waiting_list_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "therapy_waiting_list" ADD CONSTRAINT "therapy_waiting_list_preferred_therapist_id_fkey"
    FOREIGN KEY ("preferred_therapist_id") REFERENCES "therapists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "therapy_waiting_list" ADD CONSTRAINT "therapy_waiting_list_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "therapy_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Treatment plans
CREATE TABLE "treatment_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "therapy_type" "TherapyType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "start_date" DATE NOT NULL,
    "review_date" DATE,
    "status" "TreatmentPlanStatus" NOT NULL DEFAULT 'draft',
    "previous_version_id" UUID,
    "created_by_therapist_id" UUID NOT NULL,
    "shared_with_guardian_at" TIMESTAMPTZ,
    "document_attachment_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "treatment_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "treatment_plans_active_unique"
    ON "treatment_plans"("patient_id", "therapy_type") WHERE (status = 'active');

ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_created_by_therapist_id_fkey"
    FOREIGN KEY ("created_by_therapist_id") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_previous_version_id_fkey"
    FOREIGN KEY ("previous_version_id") REFERENCES "treatment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Treatment goals
CREATE TABLE "treatment_goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "treatment_plan_id" UUID NOT NULL,
    "goal_type" "TreatmentGoalType" NOT NULL,
    "description" TEXT NOT NULL,
    "target_behavior" TEXT,
    "baseline_measurement" TEXT,
    "target_measurement" TEXT,
    "measurement_unit" TEXT,
    "target_date" DATE,
    "status" "IepGoalStatus" NOT NULL DEFAULT 'not_started',
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "treatment_goals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "treatment_goals" ADD CONSTRAINT "treatment_goals_treatment_plan_id_fkey"
    FOREIGN KEY ("treatment_plan_id") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Treatment goal progress
CREATE TABLE "treatment_goal_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "treatment_goal_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "measured_value" TEXT,
    "progress_percentage" INTEGER,
    "narrative" TEXT,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "treatment_goal_progress_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "treatment_goal_progress" ADD CONSTRAINT "treatment_goal_progress_treatment_goal_id_fkey"
    FOREIGN KEY ("treatment_goal_id") REFERENCES "treatment_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "treatment_goal_progress" ADD CONSTRAINT "treatment_goal_progress_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "therapy_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Therapy fee structures
CREATE TABLE "therapy_fee_structures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "therapy_type" "TherapyType" NOT NULL,
    "session_mode" "SessionMode" NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "group_id" UUID,
    "amount" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "therapy_fee_structures_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "therapy_fee_structures" ADD CONSTRAINT "therapy_fee_structures_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "therapy_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Therapy invoices
CREATE TABLE "therapy_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_number" TEXT NOT NULL,
    "patient_id" UUID NOT NULL,
    "session_mode" "SessionMode" NOT NULL,
    "group_id" UUID,
    "billing_type" "TherapyBillingType" NOT NULL,
    "period_month" INTEGER,
    "period_year" INTEGER,
    "gross_amount" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "net_amount" INTEGER NOT NULL,
    "paid_amount" INTEGER NOT NULL DEFAULT 0,
    "outstanding_amount" INTEGER NOT NULL,
    "status" "TherapyInvoiceStatus" NOT NULL DEFAULT 'draft',
    "cancelled_reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "therapy_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "therapy_invoices_invoice_number_key" ON "therapy_invoices"("invoice_number");

ALTER TABLE "therapy_invoices" ADD CONSTRAINT "therapy_invoices_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "therapy_invoices" ADD CONSTRAINT "therapy_invoices_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "therapy_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Therapy invoice lines
CREATE TABLE "therapy_invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "session_id" UUID,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "net_amount" INTEGER NOT NULL,
    CONSTRAINT "therapy_invoice_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "therapy_invoice_lines" ADD CONSTRAINT "therapy_invoice_lines_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "therapy_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "therapy_invoice_lines" ADD CONSTRAINT "therapy_invoice_lines_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "therapy_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Therapy payments
CREATE TABLE "therapy_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_number" TEXT NOT NULL,
    "invoice_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "payment_date" DATE NOT NULL,
    "received_by" UUID NOT NULL,
    "status" "TherapyPaymentStatus" NOT NULL DEFAULT 'recorded',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "therapy_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "therapy_payments_receipt_number_key" ON "therapy_payments"("receipt_number");

ALTER TABLE "therapy_payments" ADD CONSTRAINT "therapy_payments_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "therapy_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "therapy_payments" ADD CONSTRAINT "therapy_payments_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Therapy refunds
CREATE TABLE "therapy_refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refund_date" DATE NOT NULL,
    "approved_by" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "TherapyPaymentStatus" NOT NULL DEFAULT 'recorded',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "therapy_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "therapy_refunds_payment_id_key" ON "therapy_refunds"("payment_id");

ALTER TABLE "therapy_refunds" ADD CONSTRAINT "therapy_refunds_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "therapy_refunds" ADD CONSTRAINT "therapy_refunds_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "therapy_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Therapy discounts
CREATE TABLE "therapy_discounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "invoice_id" UUID,
    "group_id" UUID,
    "discount_type" "DiscountType" NOT NULL,
    "value" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "approved_by" UUID NOT NULL,
    "approved_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "therapy_discounts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "therapy_discounts" ADD CONSTRAINT "therapy_discounts_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "therapy_discounts" ADD CONSTRAINT "therapy_discounts_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "therapy_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "therapy_discounts" ADD CONSTRAINT "therapy_discounts_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "therapy_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Numbering scheme for patients (PAT-)
INSERT INTO "numbering_schemes" ("id", "entity_type", "prefix", "pad_length", "next_value", "reset_period", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'patient', 'PAT-', 4, 1, 'never', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Numbering scheme for therapy invoices (TINV-)
INSERT INTO "numbering_schemes" ("id", "entity_type", "prefix", "pad_length", "next_value", "reset_period", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'therapy_invoice', 'TINV-', 6, 1, 'yearly', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Numbering scheme for therapy receipts (TREC-)
INSERT INTO "numbering_schemes" ("id", "entity_type", "prefix", "pad_length", "next_value", "reset_period", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'therapy_receipt', 'TREC-', 6, 1, 'yearly', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
