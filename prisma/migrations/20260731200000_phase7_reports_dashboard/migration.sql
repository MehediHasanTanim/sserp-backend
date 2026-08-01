-- Phase 7: Reports, Analytics & Dashboards

-- Report / export enums
CREATE TYPE "ReportEstimatedCost" AS ENUM ('light', 'heavy');
CREATE TYPE "ReportVisibility" AS ENUM ('private', 'role', 'organisation');
CREATE TYPE "ExportJobFormat" AS ENUM ('pdf', 'xlsx', 'csv');
CREATE TYPE "ExportJobStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'expired');
CREATE TYPE "ScheduledReportFrequency" AS ENUM ('daily', 'weekly', 'monthly', 'quarterly');
CREATE TYPE "ScheduledReportRunStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'skipped');
CREATE TYPE "MvRefreshStatus" AS ENUM ('running', 'completed', 'failed');
CREATE TYPE "ReportRowLevelScope" AS ENUM ('none', 'student', 'teacher', 'therapist', 'department');

-- Organization settings additions
ALTER TABLE "organization_settings"
    ADD COLUMN "report_sync_timeout_ms" INTEGER NOT NULL DEFAULT 5000,
    ADD COLUMN "export_max_rows" INTEGER NOT NULL DEFAULT 200000,
    ADD COLUMN "export_retention_hours" INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN "dashboard_cache_ttl_seconds" INTEGER NOT NULL DEFAULT 600;

-- report_definitions
CREATE TABLE "report_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "supported_formats" TEXT[] NOT NULL,
    "required_permissions" JSONB NOT NULL DEFAULT '[]',
    "default_sort" TEXT,
    "is_exportable" BOOLEAN NOT NULL DEFAULT true,
    "is_schedulable" BOOLEAN NOT NULL DEFAULT true,
    "estimated_cost" "ReportEstimatedCost" NOT NULL DEFAULT 'light',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "report_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_definitions_code_key" ON "report_definitions"("code");

-- saved_report_templates
CREATE TABLE "saved_report_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "visibility" "ReportVisibility" NOT NULL DEFAULT 'private',
    "visible_to_roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "column_selection" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "saved_report_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saved_report_templates_owner_user_id_idx" ON "saved_report_templates"("owner_user_id");
CREATE INDEX "saved_report_templates_report_code_idx" ON "saved_report_templates"("report_code");

-- custom_reports
CREATE TABLE "custom_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "base_dataset" TEXT NOT NULL,
    "selected_columns" JSONB NOT NULL DEFAULT '[]',
    "filters" JSONB NOT NULL DEFAULT '[]',
    "group_by" JSONB NOT NULL DEFAULT '[]',
    "aggregations" JSONB NOT NULL DEFAULT '[]',
    "sort" JSONB NOT NULL DEFAULT '[]',
    "visibility" "ReportVisibility" NOT NULL DEFAULT 'private',
    "visible_to_roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "custom_reports_pkey" PRIMARY KEY ("id")
);

-- report_datasets
CREATE TABLE "report_datasets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "columns" JSONB NOT NULL DEFAULT '[]',
    "joins" JSONB NOT NULL DEFAULT '[]',
    "row_level_scope" "ReportRowLevelScope" NOT NULL DEFAULT 'none',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "report_datasets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_datasets_key_key" ON "report_datasets"("key");

-- export_jobs
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_code" TEXT,
    "custom_report_id" UUID,
    "requested_by" UUID NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "format" "ExportJobFormat" NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'queued',
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "row_count" INTEGER,
    "object_key" TEXT,
    "file_size_bytes" INTEGER,
    "error_message" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "export_jobs_requested_by_status_idx" ON "export_jobs"("requested_by", "status");
CREATE INDEX "export_jobs_status_queued_at_idx" ON "export_jobs"("status", "queued_at");
CREATE INDEX "export_jobs_expires_at_idx" ON "export_jobs"("expires_at");

ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_custom_report_id_fkey"
    FOREIGN KEY ("custom_report_id") REFERENCES "custom_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- scheduled_reports
CREATE TABLE "scheduled_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_code" TEXT NOT NULL,
    "saved_template_id" UUID,
    "name" TEXT NOT NULL,
    "frequency" "ScheduledReportFrequency" NOT NULL,
    "day_of_week" INTEGER,
    "day_of_month" INTEGER,
    "send_time" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "format" "ExportJobFormat" NOT NULL,
    "recipient_user_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "recipient_emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "last_run_status" "ScheduledReportRunStatus",
    "next_run_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scheduled_reports_is_active_next_run_at_idx" ON "scheduled_reports"("is_active", "next_run_at");

-- scheduled_report_runs
CREATE TABLE "scheduled_report_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scheduled_report_id" UUID NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledReportRunStatus" NOT NULL,
    "export_job_id" UUID,
    "recipients_notified" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scheduled_report_runs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "scheduled_report_runs" ADD CONSTRAINT "scheduled_report_runs_scheduled_report_id_fkey"
    FOREIGN KEY ("scheduled_report_id") REFERENCES "scheduled_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scheduled_report_runs" ADD CONSTRAINT "scheduled_report_runs_export_job_id_fkey"
    FOREIGN KEY ("export_job_id") REFERENCES "export_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- dashboard_widget_preferences
CREATE TABLE "dashboard_widget_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "dashboard_role" TEXT NOT NULL,
    "widget_layout" JSONB NOT NULL DEFAULT '[]',
    "hidden_widgets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dashboard_widget_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dashboard_widget_preferences_user_id_dashboard_role_key"
    ON "dashboard_widget_preferences"("user_id", "dashboard_role");

-- mv_refresh_log
CREATE TABLE "mv_refresh_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "view_name" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "row_count" INTEGER,
    "status" "MvRefreshStatus" NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mv_refresh_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mv_refresh_log_view_name_started_at_idx" ON "mv_refresh_log"("view_name", "started_at");

-- Materialised views (WITH NO DATA; populated by refresh job)

CREATE MATERIALIZED VIEW "mv_monthly_attendance_summary" AS
SELECT
    sa.student_id,
    EXTRACT(YEAR FROM sa.attendance_date)::INTEGER AS period_year,
    EXTRACT(MONTH FROM sa.attendance_date)::INTEGER AS period_month,
    COUNT(*)::INTEGER AS working_days,
    COUNT(*) FILTER (WHERE sa.status = 'present')::INTEGER AS present,
    COUNT(*) FILTER (WHERE sa.status = 'absent')::INTEGER AS absent,
    COUNT(*) FILTER (WHERE sa.status = 'late')::INTEGER AS late,
    COUNT(*) FILTER (WHERE sa.status = 'half_day')::INTEGER AS half_day,
    COUNT(*) FILTER (WHERE sa.status = 'excused_leave')::INTEGER AS excused,
    COUNT(*) FILTER (WHERE sa.status = 'medical')::INTEGER AS medical,
    CASE
        WHEN COUNT(*) > 0 THEN ROUND(
            100.0 * COUNT(*) FILTER (WHERE sa.status IN ('present', 'late', 'half_day')) / COUNT(*),
            2
        )
        ELSE 0
    END AS attendance_percentage
FROM student_attendance sa
GROUP BY sa.student_id, period_year, period_month
WITH NO DATA;

CREATE UNIQUE INDEX "mv_monthly_attendance_summary_student_period_key"
    ON "mv_monthly_attendance_summary"("student_id", "period_year", "period_month");

CREATE MATERIALIZED VIEW "mv_daily_attendance_rollup" AS
SELECT
    sa.attendance_date,
    sa.shift_id,
    COUNT(DISTINCT sa.student_id)::INTEGER AS enrolled,
    COUNT(*) FILTER (WHERE sa.status IN ('present', 'late', 'half_day'))::INTEGER AS present,
    COUNT(*) FILTER (WHERE sa.status = 'absent')::INTEGER AS absent,
    CASE
        WHEN COUNT(*) > 0 THEN ROUND(
            100.0 * COUNT(*) FILTER (WHERE sa.status IN ('present', 'late', 'half_day')) / COUNT(*),
            2
        )
        ELSE 0
    END AS attendance_percentage
FROM student_attendance sa
GROUP BY sa.attendance_date, sa.shift_id
WITH NO DATA;

CREATE UNIQUE INDEX "mv_daily_attendance_rollup_date_shift_key"
    ON "mv_daily_attendance_rollup"("attendance_date", "shift_id");

CREATE MATERIALIZED VIEW "mv_iep_goal_progress" AS
SELECT
    ip.student_id,
    ig.skill_domain_id,
    COUNT(*)::INTEGER AS total_goals,
    COUNT(*) FILTER (WHERE ig.status = 'not_started')::INTEGER AS not_started,
    COUNT(*) FILTER (WHERE ig.status = 'in_progress')::INTEGER AS in_progress,
    COUNT(*) FILTER (WHERE ig.status = 'achieved')::INTEGER AS achieved,
    COUNT(*) FILTER (WHERE ig.status = 'discontinued')::INTEGER AS discontinued,
    CASE
        WHEN COUNT(*) > 0 THEN ROUND(
            100.0 * COUNT(*) FILTER (WHERE ig.status = 'achieved') / COUNT(*),
            2
        )
        ELSE 0
    END AS achievement_rate
FROM iep_goals ig
JOIN iep_plans ip ON ip.id = ig.iep_id
GROUP BY ip.student_id, ig.skill_domain_id
WITH NO DATA;

CREATE UNIQUE INDEX "mv_iep_goal_progress_student_domain_key"
    ON "mv_iep_goal_progress"("student_id", "skill_domain_id");

CREATE MATERIALIZED VIEW "mv_fee_collection_summary" AS
SELECT
    fi.period_year,
    fi.period_month,
    fil.fee_head_id,
    COALESCE(SUM(fil.net_amount), 0)::INTEGER AS billed,
    COALESCE(SUM(fil.net_amount) FILTER (WHERE fi.status IN ('paid', 'partially_paid')), 0)::INTEGER AS collected,
    COALESCE(SUM(fil.net_amount) FILTER (WHERE fi.outstanding_amount > 0), 0)::INTEGER AS outstanding,
    COALESCE(SUM(fi.waived_amount), 0)::INTEGER AS waived,
    COALESCE(SUM(fil.discount_amount), 0)::INTEGER AS discounted
FROM fee_invoices fi
JOIN fee_invoice_lines fil ON fil.invoice_id = fi.id
WHERE fi.period_year IS NOT NULL AND fi.period_month IS NOT NULL
GROUP BY fi.period_year, fi.period_month, fil.fee_head_id
WITH NO DATA;

CREATE UNIQUE INDEX "mv_fee_collection_summary_period_fee_head_key"
    ON "mv_fee_collection_summary"("period_year", "period_month", "fee_head_id");

CREATE MATERIALIZED VIEW "mv_therapy_session_summary" AS
SELECT
    ts.therapist_id,
    EXTRACT(YEAR FROM ts.scheduled_start)::INTEGER AS period_year,
    EXTRACT(MONTH FROM ts.scheduled_start)::INTEGER AS period_month,
    ts.therapy_type,
    ts.session_mode,
    COUNT(*) FILTER (WHERE ts.status = 'scheduled')::INTEGER AS scheduled,
    COUNT(*) FILTER (WHERE ts.status = 'completed')::INTEGER AS completed,
    COUNT(*) FILTER (WHERE ts.status = 'cancelled')::INTEGER AS cancelled,
    COUNT(*) FILTER (WHERE ts.status = 'no_show')::INTEGER AS no_show,
    COALESCE(
        SUM(COALESCE(ts.duration_minutes_actual, ts.duration_minutes_planned))
            FILTER (WHERE ts.status = 'completed'),
        0
    )::INTEGER AS minutes_delivered
FROM therapy_sessions ts
GROUP BY ts.therapist_id, period_year, period_month, ts.therapy_type, ts.session_mode
WITH NO DATA;

CREATE UNIQUE INDEX "mv_therapy_session_summary_therapist_period_type_mode_key"
    ON "mv_therapy_session_summary"(
        "therapist_id",
        "period_year",
        "period_month",
        "therapy_type",
        "session_mode"
    );

CREATE MATERIALIZED VIEW "mv_therapy_revenue_summary" AS
SELECT
    COALESCE(ts.therapy_type, 'other'::"TherapyType") AS therapy_type,
    ti.session_mode,
    ti.period_year,
    ti.period_month,
    COALESCE(SUM(ti.net_amount), 0)::INTEGER AS billed,
    COALESCE(SUM(ti.paid_amount), 0)::INTEGER AS collected,
    COALESCE(SUM(ti.outstanding_amount), 0)::INTEGER AS outstanding
FROM therapy_invoices ti
LEFT JOIN therapy_invoice_lines til ON til.invoice_id = ti.id
LEFT JOIN therapy_sessions ts ON ts.id = til.session_id
WHERE ti.period_year IS NOT NULL AND ti.period_month IS NOT NULL
GROUP BY COALESCE(ts.therapy_type, 'other'::"TherapyType"), ti.session_mode, ti.period_year, ti.period_month
WITH NO DATA;

CREATE UNIQUE INDEX "mv_therapy_revenue_summary_type_mode_period_key"
    ON "mv_therapy_revenue_summary"("therapy_type", "session_mode", "period_year", "period_month");

CREATE MATERIALIZED VIEW "mv_group_attendance_summary" AS
SELECT
    ts.group_id,
    gsa.patient_id,
    COUNT(*)::INTEGER AS sessions_held,
    COUNT(*) FILTER (WHERE gsa.status = 'present')::INTEGER AS present,
    COUNT(*) FILTER (WHERE gsa.status = 'absent')::INTEGER AS absent,
    COUNT(*) FILTER (WHERE gsa.status = 'late')::INTEGER AS late,
    COUNT(*) FILTER (WHERE gsa.status = 'excused')::INTEGER AS excused
FROM group_session_attendances gsa
JOIN therapy_sessions ts ON ts.id = gsa.session_id
WHERE ts.group_id IS NOT NULL AND ts.status = 'completed'
GROUP BY ts.group_id, gsa.patient_id
WITH NO DATA;

CREATE UNIQUE INDEX "mv_group_attendance_summary_group_patient_key"
    ON "mv_group_attendance_summary"("group_id", "patient_id");

CREATE MATERIALIZED VIEW "mv_hr_attendance_summary" AS
SELECT
    ha.employee_id,
    EXTRACT(YEAR FROM ha.attendance_date)::INTEGER AS period_year,
    EXTRACT(MONTH FROM ha.attendance_date)::INTEGER AS period_month,
    COUNT(*)::INTEGER AS working_days,
    COUNT(*) FILTER (WHERE ha.status = 'present')::INTEGER AS present,
    COUNT(*) FILTER (WHERE ha.status = 'absent')::INTEGER AS absent,
    COUNT(*) FILTER (WHERE ha.status = 'late')::INTEGER AS late,
    COUNT(*) FILTER (WHERE ha.status = 'leave')::INTEGER AS leave_days,
    COALESCE(SUM(ha.overtime_minutes), 0)::INTEGER AS overtime_minutes
FROM hr_attendance ha
GROUP BY ha.employee_id, period_year, period_month
WITH NO DATA;

CREATE UNIQUE INDEX "mv_hr_attendance_summary_employee_period_key"
    ON "mv_hr_attendance_summary"("employee_id", "period_year", "period_month");

CREATE MATERIALIZED VIEW "mv_account_period_balances" AS
SELECT
    jl.account_id,
    fp.id AS fiscal_period_id,
    fp.period_year,
    fp.period_month,
    COALESCE(coa.opening_balance, 0)::INTEGER AS opening_balance,
    COALESCE(SUM(jl.debit_amount), 0)::INTEGER AS debits,
    COALESCE(SUM(jl.credit_amount), 0)::INTEGER AS credits,
    COALESCE(coa.opening_balance, 0)::INTEGER
        + COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0)::INTEGER AS closing_balance
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_id
JOIN fiscal_periods fp ON fp.id = je.fiscal_period_id
JOIN chart_of_accounts coa ON coa.id = jl.account_id
WHERE je.status = 'posted'
GROUP BY jl.account_id, fp.id, fp.period_year, fp.period_month, coa.opening_balance
WITH NO DATA;

CREATE UNIQUE INDEX "mv_account_period_balances_account_period_key"
    ON "mv_account_period_balances"("account_id", "fiscal_period_id");

CREATE MATERIALIZED VIEW "mv_stock_position" AS
SELECT
    sm.item_id,
    sm.location_id,
    COALESCE(SUM(
        CASE
            WHEN sm.movement_type IN ('receipt', 'transfer_in', 'adjustment_increase', 'return', 'opening')
                THEN sm.quantity
            WHEN sm.movement_type IN ('issue', 'transfer_out', 'adjustment_decrease', 'disposal')
                THEN -sm.quantity
            ELSE 0
        END
    ), 0) AS on_hand,
    COALESCE(SUM(sm.total_cost), 0)::INTEGER AS stock_value,
    (
        COALESCE(SUM(
            CASE
                WHEN sm.movement_type IN ('receipt', 'transfer_in', 'adjustment_increase', 'return', 'opening')
                    THEN sm.quantity
                WHEN sm.movement_type IN ('issue', 'transfer_out', 'adjustment_decrease', 'disposal')
                    THEN -sm.quantity
                ELSE 0
            END
        ), 0) < i.minimum_stock_level
    ) AS below_minimum
FROM stock_movements sm
JOIN items i ON i.id = sm.item_id
GROUP BY sm.item_id, sm.location_id, i.minimum_stock_level
WITH NO DATA;

CREATE UNIQUE INDEX "mv_stock_position_item_location_key"
    ON "mv_stock_position"("item_id", "location_id");
