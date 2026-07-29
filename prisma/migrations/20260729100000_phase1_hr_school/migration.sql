-- CreateEnum
CREATE TYPE "HrDepartment" AS ENUM ('school', 'therapy', 'administration', 'support');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('permanent', 'contractual', 'part_time');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'on_probation', 'on_notice', 'resigned', 'terminated', 'retired');

-- CreateEnum
CREATE TYPE "EmployeeDocumentType" AS ENUM ('nid', 'qualification', 'police_clearance', 'offer_letter', 'other');

-- CreateEnum
CREATE TYPE "EmployeeChangeType" AS ENUM ('transfer', 'promotion', 'designation_change', 'salary_change', 'status_change');

-- CreateEnum
CREATE TYPE "ExitType" AS ENUM ('resignation', 'termination', 'retirement');

-- CreateEnum
CREATE TYPE "ExitStatus" AS ENUM ('in_progress', 'completed');

-- CreateEnum
CREATE TYPE "HrAttendanceStatus" AS ENUM ('present', 'absent', 'late', 'half_day', 'on_duty', 'holiday', 'leave');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('manual', 'biometric');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('public', 'school', 'optional');

-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('planning', 'active', 'closed');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('pending_admission_fee', 'active', 'on_leave', 'inactive', 'graduated', 'transferred', 'withdrawn');

-- CreateEnum
CREATE TYPE "StudentDocumentType" AS ENUM ('birth_certificate', 'disability_certificate', 'doctor_report', 'previous_iep', 'photo', 'other');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('enrolled', 'carried_forward', 'completed', 'withdrawn');

-- CreateEnum
CREATE TYPE "AdmissionFeeStatus" AS ENUM ('pending', 'paid', 'waived');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'bank_transfer', 'cheque', 'online');

-- CreateEnum
CREATE TYPE "TeacherStatus" AS ENUM ('active', 'on_leave', 'resigned', 'transferred');

-- CreateEnum
CREATE TYPE "SubstituteTrigger" AS ENUM ('absence', 'leave');

-- CreateEnum
CREATE TYPE "SubstituteStatus" AS ENUM ('pending', 'assigned', 'auto_reverted', 'cancelled');

-- CreateEnum
CREATE TYPE "StudentAttendanceStatus" AS ENUM ('present', 'absent', 'late', 'half_day', 'excused_leave', 'medical');

-- CreateEnum
CREATE TYPE "AmendmentStatus" AS ENUM ('pending', 'approved', 'rejected');

-- DropIndex
DROP INDEX "audit_logs_created_at_brin_idx";

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "working_week" JSONB NOT NULL DEFAULT '[5, 6]';

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "gender" TEXT,
    "national_id" TEXT,
    "personal_email" TEXT,
    "phone" TEXT,
    "address" JSONB,
    "photo_attachment_id" UUID,
    "department" "HrDepartment" NOT NULL,
    "designation" TEXT NOT NULL,
    "employment_type" "EmploymentType" NOT NULL,
    "reporting_manager_id" UUID,
    "joining_date" DATE NOT NULL,
    "probation_end_date" DATE,
    "confirmation_date" DATE,
    "basic_salary" INTEGER NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'on_probation',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_contracts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "contract_type" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "attachment_id" UUID,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "document_type" "EmployeeDocumentType" NOT NULL,
    "attachment_id" UUID NOT NULL,
    "issued_date" DATE,
    "expiry_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "change_type" "EmployeeChangeType" NOT NULL,
    "effective_date" DATE NOT NULL,
    "from_value" JSONB,
    "to_value" JSONB,
    "reason" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_exits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "exit_type" "ExitType" NOT NULL,
    "notice_date" DATE NOT NULL,
    "last_working_day" DATE NOT NULL,
    "exit_interview_notes" TEXT,
    "clearance_checklist" JSONB,
    "status" "ExitStatus" NOT NULL DEFAULT 'in_progress',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_exits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "grace_minutes" INTEGER NOT NULL DEFAULT 15,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_shift_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "hr_shift_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "status" "HrAttendanceStatus" NOT NULL,
    "check_in" TIMESTAMP(3),
    "check_out" TIMESTAMP(3),
    "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "source" "AttendanceSource" NOT NULL DEFAULT 'manual',
    "remarks" TEXT,
    "marked_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "annual_entitlement_days" DECIMAL(5,2) NOT NULL,
    "carry_forward_allowed" BOOLEAN NOT NULL DEFAULT false,
    "max_carry_forward_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "requires_medical_certificate_after_days" INTEGER,
    "is_encashable" BOOLEAN NOT NULL DEFAULT false,
    "max_encashable_days_per_year" DECIMAL(5,2),
    "min_balance_to_retain" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "applies_to_employment_types" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "entitled_days" DECIMAL(5,2) NOT NULL,
    "carried_forward_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "consumed_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "encashed_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "pending_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_leave_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "total_days" DECIMAL(5,2) NOT NULL,
    "is_half_day" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "medical_certificate_attachment_id" UUID,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'pending',
    "current_approval_level" INTEGER NOT NULL DEFAULT 1,
    "rejected_reason" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_approval_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leave_request_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "approver_role" TEXT NOT NULL,
    "approver_user_id" UUID,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'pending',
    "decided_at" TIMESTAMP(3),
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "holiday_date" DATE NOT NULL,
    "type" "HolidayType" NOT NULL,
    "academic_year_id" UUID,
    "applies_to_departments" TEXT[],
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "status" "AcademicYearStatus" NOT NULL DEFAULT 'planning',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_terms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "capacity_limit" INTEGER,
    "break_start" TIME(0),
    "break_end" TIME(0),
    "working_hours" DECIMAL(4,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "gender" TEXT,
    "nationality" TEXT,
    "religion" TEXT,
    "disability_category" TEXT,
    "severity_level" TEXT,
    "blood_group" TEXT,
    "photo_attachment_id" UUID,
    "previous_institution" TEXT,
    "previous_therapy_history" TEXT,
    "support_needs" TEXT,
    "shift_id" UUID,
    "academic_year_id" UUID,
    "status" "StudentStatus" NOT NULL DEFAULT 'pending_admission_fee',
    "status_reason" TEXT,
    "admission_date" DATE,
    "enrollment_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "from_status" "StudentStatus" NOT NULL,
    "to_status" "StudentStatus" NOT NULL,
    "reason" TEXT,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_manual_override" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "student_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "occupation" TEXT,
    "national_id" TEXT,
    "address" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_emergency_contact" BOOLEAN NOT NULL DEFAULT false,
    "emergency_priority" INTEGER,
    "portal_access_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "document_type" "StudentDocumentType" NOT NULL,
    "attachment_id" UUID NOT NULL,
    "issued_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "enrollment_date" DATE NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'enrolled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_fee_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "student_category" TEXT,
    "amount" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_fee_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_fees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "AdmissionFeeStatus" NOT NULL DEFAULT 'pending',
    "invoice_date" DATE NOT NULL,
    "paid_date" DATE,
    "paid_amount" INTEGER,
    "payment_method" "PaymentMethod",
    "payment_reference" TEXT,
    "receipt_number" TEXT,
    "recorded_by" UUID,
    "attachment_id" UUID,
    "waiver_approved_by" UUID,
    "waiver_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "specialization_areas" TEXT[],
    "teaching_methodology" TEXT,
    "years_experience_special_needs" INTEGER,
    "status" "TeacherStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_certifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "issuing_body" TEXT NOT NULL,
    "issued_date" DATE,
    "expiry_date" DATE,
    "attachment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_shift_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_teacher_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "teacher_employee_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "mapping_type" TEXT NOT NULL DEFAULT 'primary',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_reason" TEXT,
    "ended_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_teacher_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substitute_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "primary_teacher_id" UUID NOT NULL,
    "substitute_teacher_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "trigger_type" "SubstituteTrigger" NOT NULL,
    "trigger_reference_id" UUID NOT NULL,
    "status" "SubstituteStatus" NOT NULL DEFAULT 'pending',
    "assigned_by" UUID,
    "reverted_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "substitute_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "shift_id" UUID NOT NULL,
    "status" "StudentAttendanceStatus" NOT NULL,
    "remarks" TEXT,
    "marked_by" UUID,
    "marked_at" TIMESTAMP(3),
    "is_amended" BOOLEAN NOT NULL DEFAULT false,
    "amended_by" UUID,
    "amended_at" TIMESTAMP(3),
    "amendment_reason" TEXT,
    "amendment_approved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_amendments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attendance_id" UUID NOT NULL,
    "previous_status" "StudentAttendanceStatus" NOT NULL,
    "requested_status" "StudentAttendanceStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by" UUID NOT NULL,
    "status" "AmendmentStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "freeze_after_days" INTEGER NOT NULL DEFAULT 7,
    "allow_teacher_marking" BOOLEAN NOT NULL DEFAULT true,
    "unauthorized_absence_alert_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateIndex
CREATE INDEX "employees_department_status_idx" ON "employees"("department", "status");

-- CreateIndex
CREATE INDEX "employee_contracts_employee_id_idx" ON "employee_contracts"("employee_id");

-- CreateIndex
CREATE INDEX "employee_documents_employee_id_idx" ON "employee_documents"("employee_id");

-- CreateIndex
CREATE INDEX "employee_history_employee_id_idx" ON "employee_history"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_exits_employee_id_key" ON "employee_exits"("employee_id");

-- CreateIndex
CREATE INDEX "employee_shift_assignments_employee_id_effective_from_idx" ON "employee_shift_assignments"("employee_id", "effective_from");

-- CreateIndex
CREATE INDEX "hr_attendance_attendance_date_status_idx" ON "hr_attendance"("attendance_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hr_attendance_employee_id_attendance_date_key" ON "hr_attendance"("employee_id", "attendance_date");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_code_key" ON "leave_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employee_id_leave_type_id_year_key" ON "leave_balances"("employee_id", "leave_type_id", "year");

-- CreateIndex
CREATE INDEX "hr_leave_requests_employee_id_status_idx" ON "hr_leave_requests"("employee_id", "status");

-- CreateIndex
CREATE INDEX "hr_leave_requests_start_date_end_date_status_idx" ON "hr_leave_requests"("start_date", "end_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "leave_approval_steps_leave_request_id_level_key" ON "leave_approval_steps"("leave_request_id", "level");

-- CreateIndex
CREATE INDEX "holidays_holiday_date_idx" ON "holidays"("holiday_date");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_holiday_date_type_key" ON "holidays"("holiday_date", "type");

-- CreateIndex
CREATE UNIQUE INDEX "academic_terms_academic_year_id_sequence_key" ON "academic_terms"("academic_year_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_name_key" ON "shifts"("name");

-- CreateIndex
CREATE UNIQUE INDEX "students_student_code_key" ON "students"("student_code");

-- CreateIndex
CREATE INDEX "students_status_idx" ON "students"("status");

-- CreateIndex
CREATE INDEX "students_shift_id_idx" ON "students"("shift_id");

-- CreateIndex
CREATE INDEX "students_academic_year_id_status_idx" ON "students"("academic_year_id", "status");

-- CreateIndex
CREATE INDEX "student_status_history_student_id_changed_at_idx" ON "student_status_history"("student_id", "changed_at");

-- CreateIndex
CREATE INDEX "student_guardians_student_id_idx" ON "student_guardians"("student_id");

-- CreateIndex
CREATE INDEX "student_documents_student_id_idx" ON "student_documents"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrollments_student_id_academic_year_id_key" ON "student_enrollments"("student_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_fee_settings_academic_year_id_student_category_key" ON "admission_fee_settings"("academic_year_id", "student_category");

-- CreateIndex
CREATE UNIQUE INDEX "admission_fees_student_id_key" ON "admission_fees"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_employee_id_key" ON "teachers"("employee_id");

-- CreateIndex
CREATE INDEX "teacher_certifications_teacher_id_idx" ON "teacher_certifications"("teacher_id");

-- CreateIndex
CREATE INDEX "teacher_shift_assignments_teacher_id_shift_id_idx" ON "teacher_shift_assignments"("teacher_id", "shift_id");

-- CreateIndex
CREATE INDEX "student_teacher_mappings_teacher_employee_id_is_active_idx" ON "student_teacher_mappings"("teacher_employee_id", "is_active");

-- CreateIndex
CREATE INDEX "student_teacher_mappings_student_id_is_active_idx" ON "student_teacher_mappings"("student_id", "is_active");

-- CreateIndex
CREATE INDEX "substitute_assignments_start_date_end_date_idx" ON "substitute_assignments"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "substitute_assignments_substitute_teacher_id_start_date_idx" ON "substitute_assignments"("substitute_teacher_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "substitute_assignments_student_id_trigger_type_trigger_refe_key" ON "substitute_assignments"("student_id", "trigger_type", "trigger_reference_id");

-- CreateIndex
CREATE INDEX "student_attendance_attendance_date_idx" ON "student_attendance"("attendance_date");

-- CreateIndex
CREATE INDEX "student_attendance_shift_id_attendance_date_idx" ON "student_attendance"("shift_id", "attendance_date");

-- CreateIndex
CREATE UNIQUE INDEX "student_attendance_student_id_attendance_date_key" ON "student_attendance"("student_id", "attendance_date");

-- CreateIndex
CREATE INDEX "attendance_amendments_attendance_id_idx" ON "attendance_amendments"("attendance_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_settings_academic_year_id_key" ON "attendance_settings"("academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_reporting_manager_id_fkey" FOREIGN KEY ("reporting_manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_history" ADD CONSTRAINT "employee_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exits" ADD CONSTRAINT "employee_exits_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_hr_shift_id_fkey" FOREIGN KEY ("hr_shift_id") REFERENCES "hr_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_attendance" ADD CONSTRAINT "hr_attendance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_steps" ADD CONSTRAINT "leave_approval_steps_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "hr_leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_status_history" ADD CONSTRAINT "student_status_history_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_fee_settings" ADD CONSTRAINT "admission_fee_settings_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_fees" ADD CONSTRAINT "admission_fees_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_certifications" ADD CONSTRAINT "teacher_certifications_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_shift_assignments" ADD CONSTRAINT "teacher_shift_assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_shift_assignments" ADD CONSTRAINT "teacher_shift_assignments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_teacher_mappings" ADD CONSTRAINT "student_teacher_mappings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_teacher_mappings" ADD CONSTRAINT "student_teacher_mappings_teacher_employee_id_fkey" FOREIGN KEY ("teacher_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_teacher_mappings" ADD CONSTRAINT "student_teacher_mappings_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitute_assignments" ADD CONSTRAINT "substitute_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitute_assignments" ADD CONSTRAINT "substitute_assignments_primary_teacher_id_fkey" FOREIGN KEY ("primary_teacher_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitute_assignments" ADD CONSTRAINT "substitute_assignments_substitute_teacher_id_fkey" FOREIGN KEY ("substitute_teacher_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_amendments" ADD CONSTRAINT "attendance_amendments_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "student_attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_settings" ADD CONSTRAINT "attendance_settings_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique: single current academic year
CREATE UNIQUE INDEX "academic_years_one_current" ON "academic_years" ("is_current") WHERE "is_current" = true;

-- Partial unique: one active mapping per teacher per shift
CREATE UNIQUE INDEX "student_teacher_mappings_teacher_shift_active"
  ON "student_teacher_mappings" ("teacher_employee_id", "shift_id")
  WHERE "is_active" = true;

-- Partial unique: one active primary mapping per student
CREATE UNIQUE INDEX "student_teacher_mappings_student_active"
  ON "student_teacher_mappings" ("student_id")
  WHERE "is_active" = true;

-- Partial unique: one active teacher-shift assignment per teacher/shift
CREATE UNIQUE INDEX "teacher_shift_assignments_active"
  ON "teacher_shift_assignments" ("teacher_id", "shift_id")
  WHERE "is_active" = true;
