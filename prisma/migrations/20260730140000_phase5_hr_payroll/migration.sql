-- Phase 5: HR Payroll / Gratuity / Encashment / Performance / Recruitment / Training / Benefits

-- Payroll / HR advanced enums
CREATE TYPE "SalaryComponentType" AS ENUM ('earning', 'deduction', 'employer_contribution');
CREATE TYPE "SalaryCalculationType" AS ENUM ('fixed', 'percentage_of_basic', 'percentage_of_gross', 'formula', 'attendance_based');
CREATE TYPE "PayFrequency" AS ENUM ('monthly');
CREATE TYPE "SalaryStructureStatus" AS ENUM ('draft', 'active', 'superseded');
CREATE TYPE "PayrollRunStatus" AS ENUM ('draft', 'calculating', 'calculated', 'approved', 'locked', 'paid', 'cancelled');
CREATE TYPE "PayrollSlipPaymentStatus" AS ENUM ('pending', 'paid', 'failed');
CREATE TYPE "StatutoryDeductionType" AS ENUM ('income_tax', 'provident_fund', 'other');
CREATE TYPE "StatutoryCalculationMethod" AS ENUM ('slab', 'percentage', 'fixed');
CREATE TYPE "BonusType" AS ENUM ('festival', 'performance', 'incentive', 'other');
CREATE TYPE "BonusStatus" AS ENUM ('pending', 'approved', 'rejected', 'paid');
CREATE TYPE "PayrollAdjustmentType" AS ENUM ('addition', 'deduction');
CREATE TYPE "PayrollAdjustmentSource" AS ENUM ('manual', 'encashment', 'loan_repayment', 'advance_recovery');
CREATE TYPE "PayrollAdjustmentStatus" AS ENUM ('pending', 'applied', 'cancelled');
CREATE TYPE "GratuitySalaryBasis" AS ENUM ('basic', 'basic_plus_allowances', 'gross');
CREATE TYPE "GratuityProrationMethod" AS ENUM ('monthly', 'daily', 'none');
CREATE TYPE "GratuityLedgerEntryType" AS ENUM ('provision', 'adjustment', 'payment', 'forfeiture', 'opening');
CREATE TYPE "EncashmentStatus" AS ENUM ('pending', 'hr_approved', 'approved', 'rejected', 'processed');
CREATE TYPE "EncashmentTrigger" AS ENUM ('employee_request', 'exit_automatic');
CREATE TYPE "ReviewCycleType" AS ENUM ('annual', 'bi_annual');
CREATE TYPE "ReviewCycleStatus" AS ENUM ('planned', 'open', 'in_review', 'completed', 'closed');
CREATE TYPE "KpiMeasurementType" AS ENUM ('rating', 'numeric', 'boolean');
CREATE TYPE "AppraisalFinalRating" AS ENUM ('outstanding', 'exceeds', 'meets', 'needs_improvement', 'unsatisfactory');
CREATE TYPE "AppraisalStatus" AS ENUM ('draft', 'self_submitted', 'manager_submitted', 'finalised', 'acknowledged');
CREATE TYPE "Feedback360Relationship" AS ENUM ('peer', 'subordinate', 'other_manager');
CREATE TYPE "IncrementRecommendationStatus" AS ENUM ('pending', 'approved', 'rejected', 'applied');
CREATE TYPE "JobRequisitionStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'on_hold', 'filled', 'cancelled');
CREATE TYPE "JobPostingStatus" AS ENUM ('draft', 'published', 'closed');
CREATE TYPE "ApplicantStage" AS ENUM ('applied', 'screening', 'shortlisted', 'interviewing', 'offered', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE "InterviewType" AS ENUM ('screening', 'technical', 'panel', 'final');
CREATE TYPE "InterviewMode" AS ENUM ('in_person', 'video', 'phone');
CREATE TYPE "InterviewStatus" AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');
CREATE TYPE "InterviewRecommendation" AS ENUM ('proceed', 'hold', 'reject');
CREATE TYPE "OfferStatus" AS ENUM ('draft', 'sent', 'accepted', 'declined', 'expired', 'withdrawn');
CREATE TYPE "TrainingProgramType" AS ENUM ('in_house', 'external');
CREATE TYPE "TrainingProgramStatus" AS ENUM ('planned', 'open', 'ongoing', 'completed', 'cancelled');
CREATE TYPE "TrainingEnrollmentStatus" AS ENUM ('enrolled', 'attended', 'partially_attended', 'absent', 'withdrawn');
CREATE TYPE "TrainingAttendanceStatus" AS ENUM ('present', 'absent', 'late');
CREATE TYPE "TrainingCostType" AS ENUM ('fee', 'travel', 'material', 'venue', 'other');
CREATE TYPE "BenefitType" AS ENUM ('health_insurance', 'life_insurance', 'other');
CREATE TYPE "BenefitEnrollmentStatus" AS ENUM ('active', 'ended');
CREATE TYPE "EmployeeLoanType" AS ENUM ('loan', 'salary_advance');
CREATE TYPE "EmployeeLoanStatus" AS ENUM ('requested', 'approved', 'rejected', 'disbursed', 'repaying', 'closed', 'written_off');
CREATE TYPE "LoanRepaymentStatus" AS ENUM ('scheduled', 'deducted', 'waived', 'overdue');
CREATE TYPE "BankTransferFileFormat" AS ENUM ('csv', 'fixed_width', 'bank_specific');

-- Organization settings additions
ALTER TABLE "organization_settings"
    ADD COLUMN "gratuity_lwp_exclusion_threshold_days" INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN "payroll_default_working_days" INTEGER NOT NULL DEFAULT 22,
    ADD COLUMN "encashment_per_day_divisor" INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN "bank_transfer_file_format" "BankTransferFileFormat" NOT NULL DEFAULT 'csv';

-- Salary components
CREATE TABLE "salary_components" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "component_type" "SalaryComponentType" NOT NULL,
    "calculation_type" "SalaryCalculationType" NOT NULL,
    "value" DECIMAL(12, 4) NOT NULL DEFAULT 0,
    "formula_expression" TEXT,
    "is_taxable" BOOLEAN NOT NULL DEFAULT true,
    "is_statutory" BOOLEAN NOT NULL DEFAULT false,
    "affects_gratuity" BOOLEAN NOT NULL DEFAULT false,
    "coa_account_code" VARCHAR(20) NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salary_components_code_key" ON "salary_components"("code");

-- Payroll groups
CREATE TABLE "payroll_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "employment_types" TEXT[] NOT NULL,
    "pay_frequency" "PayFrequency" NOT NULL DEFAULT 'monthly',
    "pay_day_of_month" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_groups_pkey" PRIMARY KEY ("id")
);

-- Salary structures
CREATE TABLE "salary_structures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "payroll_group_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "gross_amount" INTEGER NOT NULL,
    "status" "SalaryStructureStatus" NOT NULL DEFAULT 'draft',
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "revision_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "salary_structures_employee_id_status_idx" ON "salary_structures"("employee_id", "status");
CREATE INDEX "salary_structures_effective_from_idx" ON "salary_structures"("effective_from");
CREATE UNIQUE INDEX "salary_structures_one_active_per_employee" ON "salary_structures"("employee_id") WHERE "status" = 'active';

ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_payroll_group_id_fkey"
    FOREIGN KEY ("payroll_group_id") REFERENCES "payroll_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Salary structure lines
CREATE TABLE "salary_structure_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "salary_structure_id" UUID NOT NULL,
    "salary_component_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "override_value" DECIMAL(12, 4),
    CONSTRAINT "salary_structure_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salary_structure_lines_salary_structure_id_salary_component_id_key"
    ON "salary_structure_lines"("salary_structure_id", "salary_component_id");

ALTER TABLE "salary_structure_lines" ADD CONSTRAINT "salary_structure_lines_salary_structure_id_fkey"
    FOREIGN KEY ("salary_structure_id") REFERENCES "salary_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salary_structure_lines" ADD CONSTRAINT "salary_structure_lines_salary_component_id_fkey"
    FOREIGN KEY ("salary_component_id") REFERENCES "salary_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Payroll runs
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "payroll_group_id" UUID NOT NULL,
    "run_number" INTEGER NOT NULL DEFAULT 1,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'draft',
    "employee_count" INTEGER NOT NULL DEFAULT 0,
    "total_gross" INTEGER NOT NULL DEFAULT 0,
    "total_deductions" INTEGER NOT NULL DEFAULT 0,
    "total_net" INTEGER NOT NULL DEFAULT 0,
    "total_employer_contribution" INTEGER NOT NULL DEFAULT 0,
    "calculated_at" TIMESTAMP(3),
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "locked_by" UUID,
    "journal_id" UUID,
    "bank_file_object_key" TEXT,
    "bank_file_checksum" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_runs_period_month_period_year_payroll_group_id_run_number_key"
    ON "payroll_runs"("period_month", "period_year", "payroll_group_id", "run_number");
CREATE INDEX "payroll_runs_period_year_period_month_payroll_group_id_idx"
    ON "payroll_runs"("period_year", "period_month", "payroll_group_id");
CREATE INDEX "payroll_runs_status_idx" ON "payroll_runs"("status");

ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_payroll_group_id_fkey"
    FOREIGN KEY ("payroll_group_id") REFERENCES "payroll_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Payroll slips
CREATE TABLE "payroll_slips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payroll_run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "slip_number" TEXT NOT NULL,
    "working_days" DECIMAL(5, 2) NOT NULL,
    "present_days" DECIMAL(5, 2) NOT NULL,
    "absent_days" DECIMAL(5, 2) NOT NULL,
    "leave_days" DECIMAL(5, 2) NOT NULL,
    "lop_days" DECIMAL(5, 2) NOT NULL,
    "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "gross_amount" INTEGER NOT NULL,
    "total_deductions" INTEGER NOT NULL,
    "net_amount" INTEGER NOT NULL,
    "document_attachment_id" UUID,
    "payment_status" "PayrollSlipPaymentStatus" NOT NULL DEFAULT 'pending',
    "payment_reference" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_slips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_slips_slip_number_key" ON "payroll_slips"("slip_number");
CREATE UNIQUE INDEX "payroll_slips_payroll_run_id_employee_id_key" ON "payroll_slips"("payroll_run_id", "employee_id");
CREATE INDEX "payroll_slips_payroll_run_id_idx" ON "payroll_slips"("payroll_run_id");
CREATE INDEX "payroll_slips_employee_id_payroll_run_id_idx" ON "payroll_slips"("employee_id", "payroll_run_id");

ALTER TABLE "payroll_slips" ADD CONSTRAINT "payroll_slips_payroll_run_id_fkey"
    FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_slips" ADD CONSTRAINT "payroll_slips_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Payroll slip lines
CREATE TABLE "payroll_slip_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payroll_slip_id" UUID NOT NULL,
    "salary_component_id" UUID,
    "component_name" TEXT NOT NULL,
    "component_type" "SalaryComponentType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "calculation_note" TEXT,
    CONSTRAINT "payroll_slip_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_slip_lines_payroll_slip_id_idx" ON "payroll_slip_lines"("payroll_slip_id");

ALTER TABLE "payroll_slip_lines" ADD CONSTRAINT "payroll_slip_lines_payroll_slip_id_fkey"
    FOREIGN KEY ("payroll_slip_id") REFERENCES "payroll_slips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_slip_lines" ADD CONSTRAINT "payroll_slip_lines_salary_component_id_fkey"
    FOREIGN KEY ("salary_component_id") REFERENCES "salary_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Statutory deduction settings
CREATE TABLE "statutory_deduction_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "deduction_type" "StatutoryDeductionType" NOT NULL,
    "name" TEXT NOT NULL,
    "calculation_method" "StatutoryCalculationMethod" NOT NULL,
    "slabs" JSONB,
    "employee_rate_percent" DECIMAL(8, 4),
    "employer_rate_percent" DECIMAL(8, 4),
    "ceiling_amount" INTEGER,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "coa_account_code" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "statutory_deduction_settings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "statutory_deduction_settings_deduction_type_effective_from_idx"
    ON "statutory_deduction_settings"("deduction_type", "effective_from");

-- Bonuses
CREATE TABLE "bonuses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "bonus_type" "BonusType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "applicable_month" INTEGER NOT NULL,
    "applicable_year" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "BonusStatus" NOT NULL DEFAULT 'pending',
    "approved_by" UUID,
    "payroll_run_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bonuses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bonuses_employee_id_applicable_year_applicable_month_idx"
    ON "bonuses"("employee_id", "applicable_year", "applicable_month");

ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_payroll_run_id_fkey"
    FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Payroll adjustments
CREATE TABLE "payroll_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "adjustment_type" "PayrollAdjustmentType" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "source_type" "PayrollAdjustmentSource" NOT NULL,
    "source_id" UUID,
    "applied_payroll_run_id" UUID,
    "status" "PayrollAdjustmentStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_adjustments_employee_id_period_year_period_month_status_idx"
    ON "payroll_adjustments"("employee_id", "period_year", "period_month", "status");

ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_applied_payroll_run_id_fkey"
    FOREIGN KEY ("applied_payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tax certificates
CREATE TABLE "tax_certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "fiscal_year" TEXT NOT NULL,
    "total_gross" INTEGER NOT NULL,
    "total_taxable" INTEGER NOT NULL,
    "total_tax_deducted" INTEGER NOT NULL,
    "document_attachment_id" UUID,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "issued_by" UUID NOT NULL,
    CONSTRAINT "tax_certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tax_certificates_employee_id_fiscal_year_key" ON "tax_certificates"("employee_id", "fiscal_year");

ALTER TABLE "tax_certificates" ADD CONSTRAINT "tax_certificates_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Gratuity policies
CREATE TABLE "gratuity_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "min_service_years" DECIMAL(4, 2) NOT NULL,
    "applicable_employment_types" TEXT[] NOT NULL,
    "days_per_year_of_service" DECIMAL(5, 2) NOT NULL,
    "salary_basis" "GratuitySalaryBasis" NOT NULL,
    "proration_method" "GratuityProrationMethod" NOT NULL,
    "max_years_counted" DECIMAL(6, 3),
    "forfeiture_on_termination" BOOLEAN NOT NULL DEFAULT false,
    "forfeiture_reasons" TEXT[] NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gratuity_policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gratuity_policies_is_active_idx" ON "gratuity_policies"("is_active");
CREATE UNIQUE INDEX "gratuity_policies_one_active" ON "gratuity_policies"((true)) WHERE "is_active" = true;

-- Gratuity entitlements
CREATE TABLE "gratuity_entitlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "as_of_date" DATE NOT NULL,
    "years_of_service" DECIMAL(6, 3) NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "salary_basis_amount" INTEGER NOT NULL,
    "entitlement_amount" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gratuity_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gratuity_entitlements_employee_id_key" ON "gratuity_entitlements"("employee_id");
CREATE INDEX "gratuity_entitlements_eligible_idx" ON "gratuity_entitlements"("eligible");

ALTER TABLE "gratuity_entitlements" ADD CONSTRAINT "gratuity_entitlements_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gratuity_entitlements" ADD CONSTRAINT "gratuity_entitlements_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "gratuity_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Gratuity provisions
CREATE TABLE "gratuity_provisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "provision_year" INTEGER NOT NULL,
    "provision_month" INTEGER NOT NULL,
    "salary_basis_amount" INTEGER NOT NULL,
    "years_of_service_at_month" DECIMAL(6, 3) NOT NULL,
    "entitlement_at_month" INTEGER NOT NULL,
    "provision_amount" INTEGER NOT NULL,
    "cumulative_total" INTEGER NOT NULL,
    "adjustment_amount" INTEGER NOT NULL DEFAULT 0,
    "adjustment_reason" TEXT,
    "journal_id" UUID,
    "computed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gratuity_provisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gratuity_provisions_employee_id_provision_year_provision_month_key"
    ON "gratuity_provisions"("employee_id", "provision_year", "provision_month");
CREATE INDEX "gratuity_provisions_employee_id_provision_year_provision_month_idx"
    ON "gratuity_provisions"("employee_id", "provision_year", "provision_month");

ALTER TABLE "gratuity_provisions" ADD CONSTRAINT "gratuity_provisions_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gratuity_provisions" ADD CONSTRAINT "gratuity_provisions_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "gratuity_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Gratuity payments
CREATE TABLE "gratuity_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "salary_basis_amount" INTEGER NOT NULL,
    "gross_amount" INTEGER NOT NULL,
    "forfeited_amount" INTEGER NOT NULL DEFAULT 0,
    "forfeiture_reason" TEXT,
    "deductions_amount" INTEGER NOT NULL DEFAULT 0,
    "deduction_detail" JSONB,
    "cumulative_provision_at_exit" INTEGER NOT NULL,
    "net_payable" INTEGER NOT NULL,
    "voucher_id" UUID,
    "journal_id" UUID,
    "settlement_letter_attachment_id" UUID,
    "approved_by" UUID,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gratuity_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gratuity_payments_employee_id_key" ON "gratuity_payments"("employee_id");

ALTER TABLE "gratuity_payments" ADD CONSTRAINT "gratuity_payments_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gratuity_payments" ADD CONSTRAINT "gratuity_payments_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "gratuity_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Gratuity ledger
CREATE TABLE "gratuity_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "entry_type" "GratuityLedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "running_balance" INTEGER NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "narration" TEXT,
    "journal_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gratuity_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gratuity_ledger_employee_id_entry_date_idx" ON "gratuity_ledger"("employee_id", "entry_date");

ALTER TABLE "gratuity_ledger" ADD CONSTRAINT "gratuity_ledger_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Encashment requests
CREATE TABLE "encashment_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "requested_days" DECIMAL(5, 2) NOT NULL,
    "eligible_days" DECIMAL(5, 2) NOT NULL,
    "per_day_amount" INTEGER NOT NULL,
    "calculated_amount" INTEGER NOT NULL,
    "approved_amount" INTEGER,
    "status" "EncashmentStatus" NOT NULL DEFAULT 'pending',
    "trigger" "EncashmentTrigger" NOT NULL DEFAULT 'employee_request',
    "current_approval_level" INTEGER NOT NULL DEFAULT 1,
    "rejection_reason" TEXT,
    "payroll_run_id" UUID,
    "payroll_adjustment_id" UUID,
    "journal_id" UUID,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "encashment_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "encashment_requests_employee_id_status_idx" ON "encashment_requests"("employee_id", "status");
CREATE INDEX "encashment_requests_status_requested_at_idx" ON "encashment_requests"("status", "requested_at");

ALTER TABLE "encashment_requests" ADD CONSTRAINT "encashment_requests_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "encashment_requests" ADD CONSTRAINT "encashment_requests_leave_type_id_fkey"
    FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "encashment_requests" ADD CONSTRAINT "encashment_requests_payroll_run_id_fkey"
    FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Encashment approval steps
CREATE TABLE "encashment_approval_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "encashment_request_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "approver_role" TEXT NOT NULL,
    "approver_user_id" UUID,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'pending',
    "decided_at" TIMESTAMP(3),
    "comment" TEXT,
    CONSTRAINT "encashment_approval_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "encashment_approval_steps_encashment_request_id_level_key"
    ON "encashment_approval_steps"("encashment_request_id", "level");

ALTER TABLE "encashment_approval_steps" ADD CONSTRAINT "encashment_approval_steps_encashment_request_id_fkey"
    FOREIGN KEY ("encashment_request_id") REFERENCES "encashment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Review cycles
CREATE TABLE "review_cycles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "cycle_type" "ReviewCycleType" NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "self_appraisal_deadline" DATE NOT NULL,
    "manager_appraisal_deadline" DATE NOT NULL,
    "status" "ReviewCycleStatus" NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "review_cycles_pkey" PRIMARY KEY ("id")
);

-- KPIs
CREATE TABLE "kpis" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "department" TEXT,
    "designation" TEXT,
    "measurement_type" "KpiMeasurementType" NOT NULL,
    "weight_percent" DECIMAL(5, 2) NOT NULL,
    "target_value" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "kpis_pkey" PRIMARY KEY ("id")
);

-- Appraisals
CREATE TABLE "appraisals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "review_cycle_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "reviewer_user_id" UUID,
    "self_submitted_at" TIMESTAMP(3),
    "manager_submitted_at" TIMESTAMP(3),
    "self_overall_rating" DECIMAL(5, 2),
    "manager_overall_rating" DECIMAL(5, 2),
    "final_score" DECIMAL(5, 2),
    "final_rating" "AppraisalFinalRating",
    "strengths" TEXT,
    "improvement_areas" TEXT,
    "status" "AppraisalStatus" NOT NULL DEFAULT 'draft',
    "employee_acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "appraisals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "appraisals_review_cycle_id_employee_id_key" ON "appraisals"("review_cycle_id", "employee_id");
CREATE INDEX "appraisals_review_cycle_id_employee_id_idx" ON "appraisals"("review_cycle_id", "employee_id");
CREATE INDEX "appraisals_status_idx" ON "appraisals"("status");

ALTER TABLE "appraisals" ADD CONSTRAINT "appraisals_review_cycle_id_fkey"
    FOREIGN KEY ("review_cycle_id") REFERENCES "review_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appraisals" ADD CONSTRAINT "appraisals_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Appraisal KPI scores
CREATE TABLE "appraisal_kpi_scores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appraisal_id" UUID NOT NULL,
    "kpi_id" UUID NOT NULL,
    "self_score" DECIMAL(5, 2),
    "manager_score" DECIMAL(5, 2),
    "weighted_score" DECIMAL(8, 4),
    "comment" TEXT,
    CONSTRAINT "appraisal_kpi_scores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "appraisal_kpi_scores_appraisal_id_kpi_id_key" ON "appraisal_kpi_scores"("appraisal_id", "kpi_id");

ALTER TABLE "appraisal_kpi_scores" ADD CONSTRAINT "appraisal_kpi_scores_appraisal_id_fkey"
    FOREIGN KEY ("appraisal_id") REFERENCES "appraisals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appraisal_kpi_scores" ADD CONSTRAINT "appraisal_kpi_scores_kpi_id_fkey"
    FOREIGN KEY ("kpi_id") REFERENCES "kpis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Feedback 360
CREATE TABLE "feedback_360" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appraisal_id" UUID NOT NULL,
    "feedback_provider_user_id" UUID NOT NULL,
    "relationship" "Feedback360Relationship" NOT NULL,
    "responses" JSONB NOT NULL,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT true,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_360_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "feedback_360" ADD CONSTRAINT "feedback_360_appraisal_id_fkey"
    FOREIGN KEY ("appraisal_id") REFERENCES "appraisals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Increment recommendations
CREATE TABLE "increment_recommendations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appraisal_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "recommended_percent" DECIMAL(5, 2) NOT NULL,
    "recommended_amount" INTEGER NOT NULL,
    "justification" TEXT,
    "status" "IncrementRecommendationStatus" NOT NULL DEFAULT 'pending',
    "approved_by" UUID,
    "applied_salary_structure_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "increment_recommendations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "increment_recommendations" ADD CONSTRAINT "increment_recommendations_appraisal_id_fkey"
    FOREIGN KEY ("appraisal_id") REFERENCES "appraisals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "increment_recommendations" ADD CONSTRAINT "increment_recommendations_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "increment_recommendations" ADD CONSTRAINT "increment_recommendations_applied_salary_structure_id_fkey"
    FOREIGN KEY ("applied_salary_structure_id") REFERENCES "salary_structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Job requisitions
CREATE TABLE "job_requisitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requisition_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "positions_count" INTEGER NOT NULL,
    "filled_count" INTEGER NOT NULL DEFAULT 0,
    "employment_type" TEXT NOT NULL,
    "justification" TEXT,
    "budget_line_id" UUID,
    "salary_range_min" INTEGER,
    "salary_range_max" INTEGER,
    "required_by_date" DATE,
    "status" "JobRequisitionStatus" NOT NULL DEFAULT 'draft',
    "raised_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_requisitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_requisitions_requisition_number_key" ON "job_requisitions"("requisition_number");

-- Job postings
CREATE TABLE "job_postings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requisition_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "posted_date" DATE,
    "closing_date" DATE,
    "channels" TEXT[] NOT NULL,
    "status" "JobPostingStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_requisition_id_fkey"
    FOREIGN KEY ("requisition_id") REFERENCES "job_requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Applicants
CREATE TABLE "applicants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "posting_id" UUID NOT NULL,
    "application_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "resume_attachment_id" UUID,
    "expected_salary" INTEGER,
    "notice_period_days" INTEGER,
    "source" TEXT,
    "stage" "ApplicantStage" NOT NULL DEFAULT 'applied',
    "stage_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rejection_reason" TEXT,
    "converted_employee_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "applicants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "applicants_application_number_key" ON "applicants"("application_number");
CREATE INDEX "applicants_posting_id_stage_idx" ON "applicants"("posting_id", "stage");

ALTER TABLE "applicants" ADD CONSTRAINT "applicants_posting_id_fkey"
    FOREIGN KEY ("posting_id") REFERENCES "job_postings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Interviews
CREATE TABLE "interviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "applicant_id" UUID NOT NULL,
    "round_number" INTEGER NOT NULL,
    "interview_type" "InterviewType" NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "mode" "InterviewMode" NOT NULL,
    "location" TEXT,
    "panel_user_ids" UUID[] NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'scheduled',
    "overall_rating" DECIMAL(5, 2),
    "recommendation" "InterviewRecommendation",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "interviews_scheduled_at_status_idx" ON "interviews"("scheduled_at", "status");

ALTER TABLE "interviews" ADD CONSTRAINT "interviews_applicant_id_fkey"
    FOREIGN KEY ("applicant_id") REFERENCES "applicants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Offers
CREATE TABLE "offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "applicant_id" UUID NOT NULL,
    "offered_designation" TEXT NOT NULL,
    "offered_department" TEXT NOT NULL,
    "offered_salary_structure" JSONB NOT NULL,
    "joining_date" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'draft',
    "document_attachment_id" UUID,
    "approved_by" UUID,
    "sent_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "offers" ADD CONSTRAINT "offers_applicant_id_fkey"
    FOREIGN KEY ("applicant_id") REFERENCES "applicants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Training programs
CREATE TABLE "training_programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "program_type" "TrainingProgramType" NOT NULL,
    "provider" TEXT,
    "description" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "duration_hours" DECIMAL(6, 2) NOT NULL,
    "venue" TEXT,
    "max_participants" INTEGER NOT NULL,
    "cost_per_participant" INTEGER,
    "total_budget" INTEGER,
    "budget_line_id" UUID,
    "status" "TrainingProgramStatus" NOT NULL DEFAULT 'planned',
    "trainer_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "training_programs_pkey" PRIMARY KEY ("id")
);

-- Training enrollments
CREATE TABLE "training_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "program_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrolled_by" UUID NOT NULL,
    "status" "TrainingEnrollmentStatus" NOT NULL DEFAULT 'enrolled',
    "completion_percentage" DECIMAL(5, 2) NOT NULL DEFAULT 0,
    "certificate_attachment_id" UUID,
    "feedback_rating" DECIMAL(3, 1),
    "feedback_comment" TEXT,
    CONSTRAINT "training_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_enrollments_program_id_employee_id_key" ON "training_enrollments"("program_id", "employee_id");

ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_program_id_fkey"
    FOREIGN KEY ("program_id") REFERENCES "training_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Training sessions
CREATE TABLE "training_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "program_id" UUID NOT NULL,
    "session_date" DATE NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "topic" TEXT,
    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_program_id_fkey"
    FOREIGN KEY ("program_id") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Training attendance
CREATE TABLE "training_attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "status" "TrainingAttendanceStatus" NOT NULL,
    "marked_by" UUID NOT NULL,
    CONSTRAINT "training_attendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_attendance_session_id_employee_id_key" ON "training_attendance"("session_id", "employee_id");

ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Training costs
CREATE TABLE "training_costs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "program_id" UUID NOT NULL,
    "cost_type" "TrainingCostType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "vendor_name" TEXT,
    "journal_id" UUID,
    "incurred_date" DATE NOT NULL,
    CONSTRAINT "training_costs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "training_costs" ADD CONSTRAINT "training_costs_program_id_fkey"
    FOREIGN KEY ("program_id") REFERENCES "training_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Benefit plans
CREATE TABLE "benefit_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "benefit_type" "BenefitType" NOT NULL,
    "provider" TEXT,
    "coverage_summary" TEXT,
    "coverage_amount" INTEGER,
    "employee_contribution_amount" INTEGER NOT NULL DEFAULT 0,
    "employer_contribution_amount" INTEGER NOT NULL DEFAULT 0,
    "policy_number" TEXT,
    "policy_start_date" DATE,
    "policy_expiry_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "benefit_plans_pkey" PRIMARY KEY ("id")
);

-- Benefit enrollments
CREATE TABLE "benefit_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "benefit_plan_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "enrolled_from" DATE NOT NULL,
    "enrolled_to" DATE,
    "dependents" JSONB,
    "status" "BenefitEnrollmentStatus" NOT NULL DEFAULT 'active',
    CONSTRAINT "benefit_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "benefit_enrollments_benefit_plan_id_employee_id_enrolled_from_key"
    ON "benefit_enrollments"("benefit_plan_id", "employee_id", "enrolled_from");

ALTER TABLE "benefit_enrollments" ADD CONSTRAINT "benefit_enrollments_benefit_plan_id_fkey"
    FOREIGN KEY ("benefit_plan_id") REFERENCES "benefit_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "benefit_enrollments" ADD CONSTRAINT "benefit_enrollments_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Employee loans
CREATE TABLE "employee_loans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "loan_type" "EmployeeLoanType" NOT NULL,
    "principal_amount" INTEGER NOT NULL,
    "interest_rate_percent" DECIMAL(6, 3) NOT NULL DEFAULT 0,
    "installment_count" INTEGER NOT NULL,
    "installment_amount" INTEGER NOT NULL,
    "disbursed_date" DATE,
    "first_deduction_month" INTEGER,
    "first_deduction_year" INTEGER,
    "outstanding_amount" INTEGER NOT NULL,
    "status" "EmployeeLoanStatus" NOT NULL DEFAULT 'requested',
    "purpose" TEXT,
    "approved_by" UUID,
    "voucher_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_loans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_loans_employee_id_status_idx" ON "employee_loans"("employee_id", "status");

ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Loan repayments
CREATE TABLE "loan_repayments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loan_id" UUID NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "due_month" INTEGER NOT NULL,
    "due_year" INTEGER NOT NULL,
    "scheduled_amount" INTEGER NOT NULL,
    "paid_amount" INTEGER NOT NULL DEFAULT 0,
    "payroll_slip_id" UUID,
    "status" "LoanRepaymentStatus" NOT NULL DEFAULT 'scheduled',
    "deducted_at" TIMESTAMP(3),
    CONSTRAINT "loan_repayments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "loan_repayments_loan_id_installment_number_key" ON "loan_repayments"("loan_id", "installment_number");
CREATE INDEX "loan_repayments_due_year_due_month_status_idx" ON "loan_repayments"("due_year", "due_month", "status");

ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_loan_id_fkey"
    FOREIGN KEY ("loan_id") REFERENCES "employee_loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_payroll_slip_id_fkey"
    FOREIGN KEY ("payroll_slip_id") REFERENCES "payroll_slips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
