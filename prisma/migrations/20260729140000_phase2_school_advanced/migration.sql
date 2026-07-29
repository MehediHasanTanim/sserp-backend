-- CreateEnum
CREATE TYPE "IepStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "IepGoalStatus" AS ENUM ('not_started', 'in_progress', 'achieved', 'discontinued');

-- CreateEnum
CREATE TYPE "IepReviewType" AS ENUM ('quarterly', 'annual', 'ad_hoc');

-- CreateEnum
CREATE TYPE "IepReviewStatus" AS ENUM ('scheduled', 'completed', 'missed');

-- CreateEnum
CREATE TYPE "ProgressReportType" AS ENUM ('monthly_progress', 'quarterly_iep');

-- CreateEnum
CREATE TYPE "ProgressReportStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'published');

-- CreateEnum
CREATE TYPE "FeeHeadType" AS ENUM ('tuition', 'transport', 'material', 'other');

-- CreateEnum
CREATE TYPE "FeeFrequency" AS ENUM ('monthly', 'term', 'annual', 'one_time');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('percentage', 'fixed');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "FeeInvoiceType" AS ENUM ('monthly', 'activity', 'adhoc');

-- CreateEnum
CREATE TYPE "FeeInvoiceStatus" AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'waived', 'cancelled');

-- CreateEnum
CREATE TYPE "FeePaymentStatus" AS ENUM ('recorded', 'reversed');

-- CreateEnum
CREATE TYPE "MedicalIncidentType" AS ENUM ('injury', 'seizure', 'health_episode', 'other');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "BehaviorSupportPlanStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('upcoming', 'ongoing', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ActivityConsentStatus" AS ENUM ('pending', 'confirmed', 'declined');

-- CreateEnum
CREATE TYPE "ActivityConsentChannel" AS ENUM ('portal', 'coordinator_manual');

-- CreateEnum
CREATE TYPE "ActivityEnrollmentState" AS ENUM ('confirmed', 'waitlisted', 'declined', 'withdrawn');

-- CreateEnum
CREATE TYPE "ActivityFeeStatus" AS ENUM ('pending', 'paid', 'waived');

-- CreateEnum
CREATE TYPE "ActivityAttendanceStatus" AS ENUM ('present', 'absent', 'withdrew_last_minute');

-- CreateEnum
CREATE TYPE "StudentLeaveType" AS ENUM ('medical', 'family', 'travel', 'other');

-- CreateEnum
CREATE TYPE "PortalThreadStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "PortalSenderType" AS ENUM ('guardian', 'staff');

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "discount_approval_threshold_percent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "fee_due_day_of_month" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "fee_reminder_days" JSONB NOT NULL DEFAULT '[3, 7, 15, 30]',
ADD COLUMN     "portal_message_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "student_guardians" ADD COLUMN     "guardian_profile_id" UUID;

-- CreateTable
CREATE TABLE "guardian_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" TEXT NOT NULL,
    "email" CITEXT,
    "phone" TEXT,
    "national_id" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardian_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_domains" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sequence" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curricula" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "disability_category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_objectives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "curriculum_id" UUID NOT NULL,
    "skill_domain_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iep_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "IepStatus" NOT NULL DEFAULT 'draft',
    "previous_version_id" UUID,
    "created_by_teacher_id" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "document_attachment_id" UUID,
    "review_frequency_months" INTEGER NOT NULL DEFAULT 3,
    "next_review_date" DATE,
    "start_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iep_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iep_goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "iep_id" UUID NOT NULL,
    "skill_domain_id" UUID NOT NULL,
    "learning_objective_id" UUID,
    "goal_type" TEXT NOT NULL DEFAULT 'short_term',
    "description" TEXT NOT NULL,
    "baseline_description" TEXT,
    "measurement_criteria" TEXT,
    "target_date" DATE,
    "status" "IepGoalStatus" NOT NULL DEFAULT 'not_started',
    "progress_percentage" INTEGER NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "responsible_teacher_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iep_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iep_goal_progress_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "goal_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "from_status" "IepGoalStatus" NOT NULL,
    "to_status" "IepGoalStatus" NOT NULL,
    "progress_percentage" INTEGER NOT NULL,
    "narrative" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iep_goal_progress_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iep_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "iep_id" UUID NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "actual_date" DATE,
    "review_type" "IepReviewType" NOT NULL,
    "status" "IepReviewStatus" NOT NULL DEFAULT 'scheduled',
    "attendees" JSONB,
    "outcome_summary" TEXT,
    "next_review_date" DATE,
    "conducted_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iep_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iep_acknowledgments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "iep_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "signature_text" TEXT NOT NULL,

    CONSTRAINT "iep_acknowledgments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "report_type" "ProgressReportType" NOT NULL,
    "disability_category" TEXT,
    "sections" JSONB NOT NULL,
    "rating_scale" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "report_type" "ProgressReportType" NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "status" "ProgressReportStatus" NOT NULL DEFAULT 'draft',
    "narrative_sections" JSONB,
    "domain_ratings" JSONB,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMP(3),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_comment" TEXT,
    "published_at" TIMESTAMP(3),
    "document_attachment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_report_goal_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "progress_report_id" UUID NOT NULL,
    "iep_goal_id" UUID NOT NULL,
    "progress_note" TEXT,
    "rating" TEXT,

    CONSTRAINT "progress_report_goal_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_report_evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "progress_report_id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,
    "caption" TEXT,

    CONSTRAINT "progress_report_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_heads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "head_type" "FeeHeadType" NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "fee_category_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "frequency" "FeeFrequency" NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_fee_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "fee_category_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_fee_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_discounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "discount_type" "DiscountType" NOT NULL,
    "value" INTEGER NOT NULL,
    "fee_head_id" UUID,
    "reason" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sponsor" TEXT,
    "coverage_type" "DiscountType" NOT NULL,
    "value" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'approved',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scholarships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_number" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "invoice_type" "FeeInvoiceType" NOT NULL,
    "period_month" INTEGER,
    "period_year" INTEGER,
    "activity_id" UUID,
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "gross_amount" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "waived_amount" INTEGER NOT NULL DEFAULT 0,
    "net_amount" INTEGER NOT NULL,
    "paid_amount" INTEGER NOT NULL DEFAULT 0,
    "outstanding_amount" INTEGER NOT NULL,
    "status" "FeeInvoiceStatus" NOT NULL DEFAULT 'draft',
    "cancelled_reason" TEXT,
    "document_attachment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "net_amount" INTEGER NOT NULL,

    CONSTRAINT "fee_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_number" TEXT NOT NULL,
    "invoice_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "payment_date" DATE NOT NULL,
    "received_by" UUID NOT NULL,
    "attachment_id" UUID,
    "status" "FeePaymentStatus" NOT NULL DEFAULT 'recorded',
    "reversal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_waivers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_waivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_medical_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "conditions" JSONB,
    "allergies" JSONB,
    "medications" JSONB,
    "emergency_protocol" TEXT,
    "blood_group" TEXT,
    "physician_name" TEXT,
    "physician_phone" TEXT,
    "has_alert_flag" BOOLEAN NOT NULL DEFAULT false,
    "alert_summary" VARCHAR(300),
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_medical_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_immunizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "vaccine_name" TEXT NOT NULL,
    "dose_number" INTEGER NOT NULL,
    "administered_date" DATE NOT NULL,
    "next_due_date" DATE,
    "attachment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_immunizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "incident_datetime" TIMESTAMP(3) NOT NULL,
    "incident_type" "MedicalIncidentType" NOT NULL,
    "description" TEXT NOT NULL,
    "action_taken" TEXT,
    "severity" "IncidentSeverity" NOT NULL,
    "reported_by" UUID NOT NULL,
    "guardian_notified_at" TIMESTAMP(3),
    "attachment_ids" UUID[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavioral_incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "incident_datetime" TIMESTAMP(3) NOT NULL,
    "behavior_type" TEXT NOT NULL,
    "antecedent" TEXT,
    "description" TEXT NOT NULL,
    "consequence" TEXT,
    "persons_involved" JSONB,
    "intervention_applied" TEXT,
    "duration_minutes" INTEGER,
    "recorded_by" UUID NOT NULL,
    "linked_iep_goal_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behavioral_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_support_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "review_date" DATE,
    "target_behaviors" JSONB NOT NULL,
    "strategies" JSONB NOT NULL,
    "status" "BehaviorSupportPlanStatus" NOT NULL DEFAULT 'active',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "behavior_support_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "default_fee_amount" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outdoor_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_type_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "activity_date" DATE NOT NULL,
    "start_time" TIME(0),
    "end_time" TIME(0),
    "duration_minutes" INTEGER,
    "venue" TEXT,
    "capacity" INTEGER NOT NULL,
    "fee_amount" INTEGER NOT NULL,
    "opt_in_deadline" TIMESTAMP(3) NOT NULL,
    "waitlist_enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "ActivityStatus" NOT NULL DEFAULT 'upcoming',
    "cancellation_reason" TEXT,
    "post_summary" TEXT,
    "participant_count" INTEGER NOT NULL DEFAULT 0,
    "fee_collected_amount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outdoor_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_supervisors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'assistant',

    CONSTRAINT "activity_supervisors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "consent_status" "ActivityConsentStatus" NOT NULL DEFAULT 'pending',
    "consent_recorded_at" TIMESTAMP(3),
    "consent_channel" "ActivityConsentChannel",
    "consent_recorded_by" UUID,
    "declined_reason" TEXT,
    "enrollment_state" "ActivityEnrollmentState" NOT NULL DEFAULT 'waitlisted',
    "waitlist_position" INTEGER,
    "invoice_id" UUID,
    "fee_status" "ActivityFeeStatus" NOT NULL DEFAULT 'pending',
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "ActivityAttendanceStatus" NOT NULL,
    "marked_by" UUID,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,
    "caption" TEXT,

    CONSTRAINT "activity_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_leave_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "leave_type" "StudentLeaveType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "total_days" DECIMAL(5,2) NOT NULL,
    "reason" TEXT,
    "document_url" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_change_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "guardian_id" UUID NOT NULL,
    "requested_changes" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "requested_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardian_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_message_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "PortalThreadStatus" NOT NULL DEFAULT 'open',
    "last_message_at" TIMESTAMP(3),
    "assigned_staff_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "sender_type" "PortalSenderType" NOT NULL,
    "body" TEXT NOT NULL,
    "attachment_id" UUID,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guardian_profiles_email_idx" ON "guardian_profiles"("email");

-- CreateIndex
CREATE UNIQUE INDEX "skill_domains_name_key" ON "skill_domains"("name");

-- CreateIndex
CREATE INDEX "curricula_academic_year_id_disability_category_idx" ON "curricula"("academic_year_id", "disability_category");

-- CreateIndex
CREATE INDEX "learning_objectives_curriculum_id_idx" ON "learning_objectives"("curriculum_id");

-- CreateIndex
CREATE INDEX "iep_plans_student_id_status_idx" ON "iep_plans"("student_id", "status");

-- CreateIndex
CREATE INDEX "iep_plans_next_review_date_idx" ON "iep_plans"("next_review_date");

-- CreateIndex
CREATE INDEX "iep_goals_iep_id_status_idx" ON "iep_goals"("iep_id", "status");

-- CreateIndex
CREATE INDEX "iep_goal_progress_entries_goal_id_entry_date_idx" ON "iep_goal_progress_entries"("goal_id", "entry_date");

-- CreateIndex
CREATE INDEX "iep_reviews_iep_id_idx" ON "iep_reviews"("iep_id");

-- CreateIndex
CREATE UNIQUE INDEX "iep_acknowledgments_iep_id_guardian_id_key" ON "iep_acknowledgments"("iep_id", "guardian_id");

-- CreateIndex
CREATE INDEX "progress_reports_student_id_report_type_period_start_idx" ON "progress_reports"("student_id", "report_type", "period_start");

-- CreateIndex
CREATE INDEX "progress_reports_status_idx" ON "progress_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "progress_reports_student_id_report_type_period_start_key" ON "progress_reports"("student_id", "report_type", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "progress_report_goal_links_progress_report_id_iep_goal_id_key" ON "progress_report_goal_links"("progress_report_id", "iep_goal_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_categories_name_key" ON "fee_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "fee_heads_code_key" ON "fee_heads"("code");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_academic_year_id_fee_category_id_fee_head_id_key" ON "fee_structures"("academic_year_id", "fee_category_id", "fee_head_id", "effective_from");

-- CreateIndex
CREATE INDEX "student_fee_assignments_student_id_idx" ON "student_fee_assignments"("student_id");

-- CreateIndex
CREATE INDEX "student_discounts_student_id_status_idx" ON "student_discounts"("student_id", "status");

-- CreateIndex
CREATE INDEX "scholarships_student_id_idx" ON "scholarships"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_invoices_invoice_number_key" ON "fee_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "fee_invoices_student_id_status_idx" ON "fee_invoices"("student_id", "status");

-- CreateIndex
CREATE INDEX "fee_invoices_due_date_status_idx" ON "fee_invoices"("due_date", "status");

-- CreateIndex
CREATE INDEX "fee_invoices_period_year_period_month_idx" ON "fee_invoices"("period_year", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "fee_payments_receipt_number_key" ON "fee_payments"("receipt_number");

-- CreateIndex
CREATE INDEX "fee_payments_invoice_id_idx" ON "fee_payments"("invoice_id");

-- CreateIndex
CREATE INDEX "fee_payments_payment_date_idx" ON "fee_payments"("payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "student_medical_records_student_id_key" ON "student_medical_records"("student_id");

-- CreateIndex
CREATE INDEX "student_immunizations_student_id_idx" ON "student_immunizations"("student_id");

-- CreateIndex
CREATE INDEX "medical_incidents_student_id_incident_datetime_idx" ON "medical_incidents"("student_id", "incident_datetime");

-- CreateIndex
CREATE INDEX "behavioral_incidents_student_id_incident_datetime_idx" ON "behavioral_incidents"("student_id", "incident_datetime");

-- CreateIndex
CREATE INDEX "behavior_support_plans_student_id_idx" ON "behavior_support_plans"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_types_name_key" ON "activity_types"("name");

-- CreateIndex
CREATE INDEX "outdoor_activities_activity_date_idx" ON "outdoor_activities"("activity_date");

-- CreateIndex
CREATE UNIQUE INDEX "activity_supervisors_activity_id_teacher_id_key" ON "activity_supervisors"("activity_id", "teacher_id");

-- CreateIndex
CREATE INDEX "activity_enrollments_activity_id_enrollment_state_idx" ON "activity_enrollments"("activity_id", "enrollment_state");

-- CreateIndex
CREATE INDEX "activity_enrollments_student_id_idx" ON "activity_enrollments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_enrollments_activity_id_student_id_key" ON "activity_enrollments"("activity_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_attendance_activity_id_student_id_key" ON "activity_attendance"("activity_id", "student_id");

-- CreateIndex
CREATE INDEX "student_leave_requests_student_id_status_idx" ON "student_leave_requests"("student_id", "status");

-- CreateIndex
CREATE INDEX "student_leave_requests_status_start_date_idx" ON "student_leave_requests"("status", "start_date");

-- CreateIndex
CREATE INDEX "guardian_change_requests_guardian_id_status_idx" ON "guardian_change_requests"("guardian_id", "status");

-- CreateIndex
CREATE INDEX "portal_message_threads_student_id_idx" ON "portal_message_threads"("student_id");

-- CreateIndex
CREATE INDEX "portal_messages_thread_id_created_at_idx" ON "portal_messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "student_guardians_guardian_profile_id_idx" ON "student_guardians"("guardian_profile_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_objectives" ADD CONSTRAINT "learning_objectives_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_objectives" ADD CONSTRAINT "learning_objectives_skill_domain_id_fkey" FOREIGN KEY ("skill_domain_id") REFERENCES "skill_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iep_plans" ADD CONSTRAINT "iep_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iep_plans" ADD CONSTRAINT "iep_plans_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iep_plans" ADD CONSTRAINT "iep_plans_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "iep_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iep_goals" ADD CONSTRAINT "iep_goals_iep_id_fkey" FOREIGN KEY ("iep_id") REFERENCES "iep_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iep_goals" ADD CONSTRAINT "iep_goals_skill_domain_id_fkey" FOREIGN KEY ("skill_domain_id") REFERENCES "skill_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iep_goals" ADD CONSTRAINT "iep_goals_learning_objective_id_fkey" FOREIGN KEY ("learning_objective_id") REFERENCES "learning_objectives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iep_goal_progress_entries" ADD CONSTRAINT "iep_goal_progress_entries_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "iep_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iep_reviews" ADD CONSTRAINT "iep_reviews_iep_id_fkey" FOREIGN KEY ("iep_id") REFERENCES "iep_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iep_acknowledgments" ADD CONSTRAINT "iep_acknowledgments_iep_id_fkey" FOREIGN KEY ("iep_id") REFERENCES "iep_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iep_acknowledgments" ADD CONSTRAINT "iep_acknowledgments_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "report_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_report_goal_links" ADD CONSTRAINT "progress_report_goal_links_progress_report_id_fkey" FOREIGN KEY ("progress_report_id") REFERENCES "progress_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_report_goal_links" ADD CONSTRAINT "progress_report_goal_links_iep_goal_id_fkey" FOREIGN KEY ("iep_goal_id") REFERENCES "iep_goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_report_evidence" ADD CONSTRAINT "progress_report_evidence_progress_report_id_fkey" FOREIGN KEY ("progress_report_id") REFERENCES "progress_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_fee_category_id_fkey" FOREIGN KEY ("fee_category_id") REFERENCES "fee_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_fee_category_id_fkey" FOREIGN KEY ("fee_category_id") REFERENCES "fee_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "outdoor_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoice_lines" ADD CONSTRAINT "fee_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoice_lines" ADD CONSTRAINT "fee_invoice_lines_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_waivers" ADD CONSTRAINT "fee_waivers_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_medical_records" ADD CONSTRAINT "student_medical_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_immunizations" ADD CONSTRAINT "student_immunizations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_incidents" ADD CONSTRAINT "medical_incidents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioral_incidents" ADD CONSTRAINT "behavioral_incidents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioral_incidents" ADD CONSTRAINT "behavioral_incidents_linked_iep_goal_id_fkey" FOREIGN KEY ("linked_iep_goal_id") REFERENCES "iep_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_support_plans" ADD CONSTRAINT "behavior_support_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outdoor_activities" ADD CONSTRAINT "outdoor_activities_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_supervisors" ADD CONSTRAINT "activity_supervisors_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "outdoor_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_supervisors" ADD CONSTRAINT "activity_supervisors_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_enrollments" ADD CONSTRAINT "activity_enrollments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "outdoor_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_enrollments" ADD CONSTRAINT "activity_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_enrollments" ADD CONSTRAINT "activity_enrollments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attendance" ADD CONSTRAINT "activity_attendance_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "outdoor_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_attendance" ADD CONSTRAINT "activity_attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_media" ADD CONSTRAINT "activity_media_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "outdoor_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_change_requests" ADD CONSTRAINT "guardian_change_requests_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_message_threads" ADD CONSTRAINT "portal_message_threads_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "portal_message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique: one active IEP per student
CREATE UNIQUE INDEX "iep_plans_one_active_per_student"
  ON "iep_plans" ("student_id") WHERE "status" = 'active';

-- Partial unique: one monthly invoice per student/year/month
CREATE UNIQUE INDEX "fee_invoices_monthly_unique"
  ON "fee_invoices" ("student_id", "period_year", "period_month")
  WHERE "invoice_type" = 'monthly' AND "period_year" IS NOT NULL AND "period_month" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_profile_id_fkey" FOREIGN KEY ("guardian_profile_id") REFERENCES "guardian_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
