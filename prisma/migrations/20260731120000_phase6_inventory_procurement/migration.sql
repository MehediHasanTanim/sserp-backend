-- Phase 6: Inventory & Procurement

-- Inventory / Asset / Audit enums
CREATE TYPE "ItemNature" AS ENUM ('consumable', 'asset', 'spare');
CREATE TYPE "ValuationMethod" AS ENUM ('fifo', 'weighted_average');
CREATE TYPE "LocationType" AS ENUM ('store', 'department', 'room');
CREATE TYPE "StockMovementType" AS ENUM ('receipt', 'issue', 'transfer_out', 'transfer_in', 'adjustment_increase', 'adjustment_decrease', 'return', 'disposal', 'opening');
CREATE TYPE "StockMovementReferenceType" AS ENUM ('grn', 'issue_request', 'transfer', 'adjustment', 'audit', 'disposal', 'opening');
CREATE TYPE "StockIssueRequestStatus" AS ENUM ('pending', 'approved', 'issued', 'partially_issued', 'rejected', 'cancelled');
CREATE TYPE "StockAdjustmentType" AS ENUM ('increase', 'decrease');
CREATE TYPE "StockAdjustmentStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected');
CREATE TYPE "DepreciationMethod" AS ENUM ('straight_line', 'reducing_balance');
CREATE TYPE "AssetCondition" AS ENUM ('new', 'good', 'fair', 'damaged', 'scrapped');
CREATE TYPE "AssetStatus" AS ENUM ('in_store', 'assigned', 'under_repair', 'disposed', 'lost');
CREATE TYPE "AssetAssignedToType" AS ENUM ('employee', 'department', 'room');
CREATE TYPE "AssetDisposalType" AS ENUM ('sale', 'scrap', 'donation', 'write_off', 'lost');
CREATE TYPE "InventoryAuditType" AS ENUM ('half_yearly', 'ad_hoc', 'cycle_count');
CREATE TYPE "InventoryAuditStatus" AS ENUM ('scheduled', 'in_progress', 'counted', 'reviewed', 'signed_off', 'cancelled');
CREATE TYPE "DiscrepancyType" AS ENUM ('match', 'surplus', 'shortage');
CREATE TYPE "CorrectiveActionStatus" AS ENUM ('open', 'in_progress', 'completed', 'waived');

-- Procurement enums
CREATE TYPE "VendorType" AS ENUM ('supplier', 'service_provider', 'contractor');
CREATE TYPE "VendorStatus" AS ENUM ('active', 'inactive', 'blacklisted');
CREATE TYPE "VendorDocumentType" AS ENUM ('trade_license', 'tax_certificate', 'bank_letter', 'agreement', 'other');
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('draft', 'pending_dept_review', 'pending_principal_approval', 'approved', 'rejected', 'po_issued', 'partially_po_issued', 'closed', 'cancelled');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'sent', 'partially_received', 'fully_received', 'closed', 'cancelled');
CREATE TYPE "GrnStatus" AS ENUM ('draft', 'quality_check', 'accepted', 'partially_accepted', 'rejected', 'posted');
CREATE TYPE "InvoiceMatchStatus" AS ENUM ('unmatched', 'matched', 'variance_within_tolerance', 'variance_exceeded');
CREATE TYPE "VendorInvoiceStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'partially_paid', 'paid', 'cancelled');
CREATE TYPE "VendorPaymentStatus" AS ENUM ('scheduled', 'paid', 'cancelled');
CREATE TYPE "VendorAdvanceStatus" AS ENUM ('open', 'partially_adjusted', 'fully_adjusted', 'refunded');

-- item_categories
CREATE TABLE "item_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "is_asset_category" BOOLEAN NOT NULL DEFAULT false,
    "default_coa_expense_code" VARCHAR(20),
    "default_coa_asset_code" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "item_categories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "item_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- units_of_measure
CREATE TABLE "units_of_measure" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "allows_fraction" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "units_of_measure_code_key" ON "units_of_measure"("code");

-- items
CREATE TABLE "items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" UUID NOT NULL,
    "unit_of_measure_id" UUID NOT NULL,
    "item_nature" "ItemNature" NOT NULL,
    "valuation_method" "ValuationMethod" NOT NULL,
    "minimum_stock_level" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    "reorder_quantity" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    "maximum_stock_level" DECIMAL(14, 3),
    "tracks_expiry" BOOLEAN NOT NULL DEFAULT false,
    "tracks_serial" BOOLEAN NOT NULL DEFAULT false,
    "manufacturer" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "photo_attachment_id" UUID,
    "standard_cost" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "items_item_code_key" ON "items"("item_code");
CREATE INDEX "items_item_code_idx" ON "items"("item_code");
CREATE INDEX "items_category_id_is_active_idx" ON "items"("category_id", "is_active");

ALTER TABLE "items" ADD CONSTRAINT "items_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "item_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_unit_of_measure_id_fkey"
    FOREIGN KEY ("unit_of_measure_id") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- locations
CREATE TABLE "locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "location_type" "LocationType" NOT NULL,
    "department" TEXT,
    "parent_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- stock_movements (append-only)
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "movement_number" TEXT NOT NULL,
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "counter_location_id" UUID,
    "movement_type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14, 3) NOT NULL,
    "unit_cost" INTEGER NOT NULL,
    "total_cost" INTEGER NOT NULL,
    "batch_number" TEXT,
    "expiry_date" DATE,
    "serial_number" TEXT,
    "reference_type" "StockMovementReferenceType" NOT NULL,
    "reference_id" UUID,
    "movement_date" DATE NOT NULL,
    "journal_id" UUID,
    "remarks" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_movements_movement_number_key" ON "stock_movements"("movement_number");
CREATE INDEX "stock_movements_item_id_movement_date_idx" ON "stock_movements"("item_id", "movement_date");
CREATE INDEX "stock_movements_location_id_movement_date_idx" ON "stock_movements"("location_id", "movement_date");
CREATE INDEX "stock_movements_reference_type_reference_id_idx" ON "stock_movements"("reference_type", "reference_id");

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_counter_location_id_fkey"
    FOREIGN KEY ("counter_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- stock_levels
CREATE TABLE "stock_levels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity_on_hand" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    "quantity_reserved" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    "average_cost" INTEGER NOT NULL DEFAULT 0,
    "last_movement_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_levels_item_id_location_id_key" ON "stock_levels"("item_id", "location_id");
CREATE INDEX "stock_levels_item_id_location_id_idx" ON "stock_levels"("item_id", "location_id");
CREATE INDEX "stock_levels_quantity_on_hand_idx" ON "stock_levels"("quantity_on_hand");

ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- stock_batches
CREATE TABLE "stock_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "batch_number" TEXT NOT NULL,
    "expiry_date" DATE,
    "received_quantity" DECIMAL(14, 3) NOT NULL,
    "remaining_quantity" DECIMAL(14, 3) NOT NULL,
    "unit_cost" INTEGER NOT NULL,
    "received_date" DATE NOT NULL,
    "grn_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_batches_item_id_location_id_expiry_date_idx" ON "stock_batches"("item_id", "location_id", "expiry_date");
CREATE INDEX "stock_batches_remaining_quantity_idx" ON "stock_batches"("remaining_quantity");

ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- stock_issue_requests
CREATE TABLE "stock_issue_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_number" TEXT NOT NULL,
    "requested_by" UUID NOT NULL,
    "department" TEXT NOT NULL,
    "to_location_id" UUID NOT NULL,
    "purpose" TEXT,
    "status" "StockIssueRequestStatus" NOT NULL DEFAULT 'pending',
    "approved_by" UUID,
    "issued_by" UUID,
    "issued_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stock_issue_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_issue_requests_request_number_key" ON "stock_issue_requests"("request_number");

ALTER TABLE "stock_issue_requests" ADD CONSTRAINT "stock_issue_requests_to_location_id_fkey"
    FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- stock_issue_request_lines
CREATE TABLE "stock_issue_request_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "requested_quantity" DECIMAL(14, 3) NOT NULL,
    "approved_quantity" DECIMAL(14, 3),
    "issued_quantity" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    CONSTRAINT "stock_issue_request_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "stock_issue_request_lines" ADD CONSTRAINT "stock_issue_request_lines_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "stock_issue_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_issue_request_lines" ADD CONSTRAINT "stock_issue_request_lines_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- inventory_audits (before stock_adjustments for audit_id FK)
CREATE TABLE "inventory_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "audit_number" TEXT NOT NULL,
    "audit_type" "InventoryAuditType" NOT NULL,
    "period_label" TEXT NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "location_ids" UUID[] NOT NULL,
    "category_ids" UUID[] NOT NULL,
    "status" "InventoryAuditStatus" NOT NULL DEFAULT 'scheduled',
    "started_at" TIMESTAMP(3),
    "counted_by" UUID,
    "reviewed_by" UUID,
    "signed_off_by" UUID,
    "signed_off_at" TIMESTAMP(3),
    "discrepancy_count" INTEGER NOT NULL DEFAULT 0,
    "net_discrepancy_value" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inventory_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_audits_audit_number_key" ON "inventory_audits"("audit_number");

-- stock_adjustments
CREATE TABLE "stock_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "adjustment_number" TEXT NOT NULL,
    "location_id" UUID NOT NULL,
    "adjustment_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "adjustment_type" "StockAdjustmentType" NOT NULL,
    "status" "StockAdjustmentStatus" NOT NULL DEFAULT 'draft',
    "approved_by" UUID,
    "journal_id" UUID,
    "audit_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_adjustments_adjustment_number_key" ON "stock_adjustments"("adjustment_number");

ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_audit_id_fkey"
    FOREIGN KEY ("audit_id") REFERENCES "inventory_audits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- stock_adjustment_lines
CREATE TABLE "stock_adjustment_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "adjustment_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "system_quantity" DECIMAL(14, 3) NOT NULL,
    "adjusted_quantity" DECIMAL(14, 3) NOT NULL,
    "difference_quantity" DECIMAL(14, 3) NOT NULL,
    "unit_cost" INTEGER NOT NULL,
    "remarks" TEXT,
    CONSTRAINT "stock_adjustment_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_adjustment_id_fkey"
    FOREIGN KEY ("adjustment_id") REFERENCES "stock_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- assets
CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_code" TEXT NOT NULL,
    "item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "serial_number" TEXT,
    "purchase_date" DATE NOT NULL,
    "purchase_cost" INTEGER NOT NULL,
    "supplier_vendor_id" UUID,
    "grn_id" UUID,
    "warranty_expiry_date" DATE,
    "useful_life_months" INTEGER,
    "salvage_value" INTEGER NOT NULL DEFAULT 0,
    "depreciation_method" "DepreciationMethod" NOT NULL,
    "depreciation_rate_percent" DECIMAL(7, 4),
    "accumulated_depreciation" INTEGER NOT NULL DEFAULT 0,
    "net_book_value" INTEGER NOT NULL,
    "condition" "AssetCondition" NOT NULL DEFAULT 'new',
    "status" "AssetStatus" NOT NULL DEFAULT 'in_store',
    "current_location_id" UUID,
    "current_assignee_employee_id" UUID,
    "coa_asset_account_code" VARCHAR(20),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assets_asset_code_key" ON "assets"("asset_code");
CREATE INDEX "assets_asset_code_idx" ON "assets"("asset_code");
CREATE INDEX "assets_status_idx" ON "assets"("status");
CREATE INDEX "assets_current_assignee_employee_id_idx" ON "assets"("current_assignee_employee_id");

ALTER TABLE "assets" ADD CONSTRAINT "assets_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_current_location_id_fkey"
    FOREIGN KEY ("current_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- asset_assignments
CREATE TABLE "asset_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "assigned_to_type" "AssetAssignedToType" NOT NULL,
    "assigned_to_id" UUID NOT NULL,
    "assigned_from" DATE NOT NULL,
    "assigned_to_date" DATE,
    "assigned_by" UUID NOT NULL,
    "returned_at" TIMESTAMP(3),
    "return_condition" "AssetCondition",
    "acknowledgement_attachment_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- asset_condition_logs
CREATE TABLE "asset_condition_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL,
    "condition" "AssetCondition" NOT NULL,
    "notes" TEXT,
    "attachment_id" UUID,
    "logged_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_condition_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "asset_condition_logs" ADD CONSTRAINT "asset_condition_logs_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- asset_depreciation_entries
CREATE TABLE "asset_depreciation_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "opening_nbv" INTEGER NOT NULL,
    "depreciation_amount" INTEGER NOT NULL,
    "closing_nbv" INTEGER NOT NULL,
    "journal_id" UUID,
    "computed_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "asset_depreciation_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_depreciation_entries_asset_id_period_year_period_month_key"
    ON "asset_depreciation_entries"("asset_id", "period_year", "period_month");

ALTER TABLE "asset_depreciation_entries" ADD CONSTRAINT "asset_depreciation_entries_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- asset_disposals
CREATE TABLE "asset_disposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "disposal_date" DATE NOT NULL,
    "disposal_type" "AssetDisposalType" NOT NULL,
    "proceeds_amount" INTEGER NOT NULL DEFAULT 0,
    "net_book_value_at_disposal" INTEGER NOT NULL,
    "gain_loss_amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "approved_by" UUID NOT NULL,
    "journal_id" UUID,
    "attachment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_disposals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- inventory_audit_lines
CREATE TABLE "inventory_audit_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "audit_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "system_quantity" DECIMAL(14, 3) NOT NULL,
    "physical_quantity" DECIMAL(14, 3),
    "difference_quantity" DECIMAL(14, 3),
    "unit_cost" INTEGER NOT NULL,
    "difference_value" INTEGER,
    "discrepancy_type" "DiscrepancyType",
    "counted_by" UUID,
    "counted_at" TIMESTAMP(3),
    "explanation" TEXT,
    CONSTRAINT "inventory_audit_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_audit_lines_audit_id_discrepancy_type_idx"
    ON "inventory_audit_lines"("audit_id", "discrepancy_type");

ALTER TABLE "inventory_audit_lines" ADD CONSTRAINT "inventory_audit_lines_audit_id_fkey"
    FOREIGN KEY ("audit_id") REFERENCES "inventory_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_audit_lines" ADD CONSTRAINT "inventory_audit_lines_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_audit_lines" ADD CONSTRAINT "inventory_audit_lines_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- audit_corrective_actions
CREATE TABLE "audit_corrective_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "audit_id" UUID NOT NULL,
    "audit_line_id" UUID NOT NULL,
    "action_description" TEXT NOT NULL,
    "responsible_user_id" UUID NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "CorrectiveActionStatus" NOT NULL DEFAULT 'open',
    "completed_at" TIMESTAMP(3),
    "outcome_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "audit_corrective_actions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "audit_corrective_actions" ADD CONSTRAINT "audit_corrective_actions_audit_id_fkey"
    FOREIGN KEY ("audit_id") REFERENCES "inventory_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_corrective_actions" ADD CONSTRAINT "audit_corrective_actions_audit_line_id_fkey"
    FOREIGN KEY ("audit_line_id") REFERENCES "inventory_audit_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- vendors
CREATE TABLE "vendors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor_type" "VendorType" NOT NULL,
    "categories" TEXT[] NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "tax_registration_number" TEXT,
    "bank_details" JSONB,
    "payment_terms_days" INTEGER,
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "performance_score" DECIMAL(4, 2),
    "status" "VendorStatus" NOT NULL DEFAULT 'active',
    "blacklist_reason" TEXT,
    "blacklisted_at" TIMESTAMP(3),
    "coa_payable_account_code" VARCHAR(20),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendors_vendor_code_key" ON "vendors"("vendor_code");
CREATE INDEX "vendors_vendor_code_idx" ON "vendors"("vendor_code");
CREATE INDEX "vendors_status_is_preferred_idx" ON "vendors"("status", "is_preferred");

-- vendor_documents
CREATE TABLE "vendor_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_id" UUID NOT NULL,
    "document_type" "VendorDocumentType" NOT NULL,
    "attachment_id" UUID NOT NULL,
    "issued_date" DATE,
    "expiry_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vendor_documents_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- purchase_requests
CREATE TABLE "purchase_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pr_number" TEXT NOT NULL,
    "requested_by" UUID NOT NULL,
    "department" TEXT NOT NULL,
    "required_by_date" DATE,
    "justification" TEXT,
    "estimated_total" INTEGER NOT NULL DEFAULT 0,
    "budget_line_id" UUID,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'draft',
    "dept_reviewed_by" UUID,
    "dept_reviewed_at" TIMESTAMP(3),
    "dept_review_comment" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "approval_comment" TEXT,
    "rejection_reason" TEXT,
    "budget_check_result" JSONB,
    "attachment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_requests_pr_number_key" ON "purchase_requests"("pr_number");
CREATE INDEX "purchase_requests_status_created_at_idx" ON "purchase_requests"("status", "created_at");
CREATE INDEX "purchase_requests_requested_by_idx" ON "purchase_requests"("requested_by");
CREATE INDEX "purchase_requests_department_status_idx" ON "purchase_requests"("department", "status");

-- purchase_request_lines
CREATE TABLE "purchase_request_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pr_id" UUID NOT NULL,
    "item_id" UUID,
    "item_description" TEXT NOT NULL,
    "quantity" DECIMAL(14, 3) NOT NULL,
    "unit_of_measure_id" UUID,
    "estimated_unit_cost" INTEGER NOT NULL DEFAULT 0,
    "estimated_total" INTEGER NOT NULL DEFAULT 0,
    "po_issued_quantity" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    CONSTRAINT "purchase_request_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_pr_id_fkey"
    FOREIGN KEY ("pr_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_unit_of_measure_id_fkey"
    FOREIGN KEY ("unit_of_measure_id") REFERENCES "units_of_measure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- purchase_orders
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "po_number" TEXT NOT NULL,
    "vendor_id" UUID NOT NULL,
    "po_date" DATE NOT NULL,
    "expected_delivery_date" DATE,
    "delivery_address" TEXT,
    "payment_terms" TEXT,
    "subtotal_amount" INTEGER NOT NULL DEFAULT 0,
    "tax_amount" INTEGER NOT NULL DEFAULT 0,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "total_amount" INTEGER NOT NULL DEFAULT 0,
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'BDT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "previous_version_id" UUID,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "journal_id" UUID,
    "document_attachment_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "purchase_orders"("po_number");
CREATE INDEX "purchase_orders_vendor_id_status_idx" ON "purchase_orders"("vendor_id", "status");
CREATE INDEX "purchase_orders_po_date_idx" ON "purchase_orders"("po_date");
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_previous_version_id_fkey"
    FOREIGN KEY ("previous_version_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- purchase_order_lines
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "po_id" UUID NOT NULL,
    "pr_line_id" UUID,
    "item_id" UUID NOT NULL,
    "item_description" TEXT NOT NULL,
    "quantity" DECIMAL(14, 3) NOT NULL,
    "unit_of_measure_id" UUID,
    "unit_price" INTEGER NOT NULL,
    "tax_id" UUID,
    "line_total" INTEGER NOT NULL,
    "received_quantity" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    "rejected_quantity" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    "invoiced_quantity" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_po_id_fkey"
    FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_pr_line_id_fkey"
    FOREIGN KEY ("pr_line_id") REFERENCES "purchase_request_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_unit_of_measure_id_fkey"
    FOREIGN KEY ("unit_of_measure_id") REFERENCES "units_of_measure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- po_amendments
CREATE TABLE "po_amendments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "po_id" UUID NOT NULL,
    "from_version" INTEGER NOT NULL,
    "to_version" INTEGER NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "amended_by" UUID NOT NULL,
    "approved_by" UUID,
    "amended_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "po_amendments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "po_amendments" ADD CONSTRAINT "po_amendments_po_id_fkey"
    FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- vendor_performance_ratings
CREATE TABLE "vendor_performance_ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_id" UUID NOT NULL,
    "po_id" UUID NOT NULL,
    "delivery_timeliness_score" DECIMAL(4, 2) NOT NULL,
    "quality_score" DECIMAL(4, 2) NOT NULL,
    "pricing_score" DECIMAL(4, 2) NOT NULL,
    "responsiveness_score" DECIMAL(4, 2) NOT NULL,
    "overall_score" DECIMAL(4, 2) NOT NULL,
    "comments" TEXT,
    "rated_by" UUID NOT NULL,
    "rated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_performance_ratings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vendor_performance_ratings" ADD CONSTRAINT "vendor_performance_ratings_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_performance_ratings" ADD CONSTRAINT "vendor_performance_ratings_po_id_fkey"
    FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- goods_receipt_notes
CREATE TABLE "goods_receipt_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "grn_number" TEXT NOT NULL,
    "po_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "receipt_date" DATE NOT NULL,
    "delivery_note_reference" TEXT,
    "received_at_location_id" UUID NOT NULL,
    "is_partial" BOOLEAN NOT NULL DEFAULT false,
    "status" "GrnStatus" NOT NULL DEFAULT 'draft',
    "received_by" UUID NOT NULL,
    "quality_checked_by" UUID,
    "posted_at" TIMESTAMP(3),
    "journal_id" UUID,
    "attachment_id" UUID,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "goods_receipt_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "goods_receipt_notes_grn_number_key" ON "goods_receipt_notes"("grn_number");

ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_po_id_fkey"
    FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_received_at_location_id_fkey"
    FOREIGN KEY ("received_at_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- grn_lines
CREATE TABLE "grn_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "grn_id" UUID NOT NULL,
    "po_line_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "ordered_quantity" DECIMAL(14, 3) NOT NULL,
    "received_quantity" DECIMAL(14, 3) NOT NULL,
    "accepted_quantity" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    "rejected_quantity" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    "rejection_reason" TEXT,
    "unit_cost" INTEGER NOT NULL,
    "batch_number" TEXT,
    "expiry_date" DATE,
    "serial_numbers" TEXT[] NOT NULL,
    "stock_movement_id" UUID,
    CONSTRAINT "grn_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "grn_lines_po_line_id_idx" ON "grn_lines"("po_line_id");

ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_grn_id_fkey"
    FOREIGN KEY ("grn_id") REFERENCES "goods_receipt_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_po_line_id_fkey"
    FOREIGN KEY ("po_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- vendor_invoices
CREATE TABLE "vendor_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_number" TEXT NOT NULL,
    "vendor_invoice_reference" TEXT,
    "vendor_id" UUID NOT NULL,
    "po_id" UUID,
    "grn_ids" UUID[] NOT NULL,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "subtotal_amount" INTEGER NOT NULL DEFAULT 0,
    "tax_amount" INTEGER NOT NULL DEFAULT 0,
    "total_amount" INTEGER NOT NULL DEFAULT 0,
    "matched_amount" INTEGER NOT NULL DEFAULT 0,
    "variance_amount" INTEGER NOT NULL DEFAULT 0,
    "match_status" "InvoiceMatchStatus" NOT NULL DEFAULT 'unmatched',
    "status" "VendorInvoiceStatus" NOT NULL DEFAULT 'draft',
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "journal_id" UUID,
    "attachment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendor_invoices_invoice_number_key" ON "vendor_invoices"("invoice_number");
CREATE INDEX "vendor_invoices_vendor_id_status_idx" ON "vendor_invoices"("vendor_id", "status");
CREATE INDEX "vendor_invoices_due_date_status_idx" ON "vendor_invoices"("due_date", "status");
CREATE INDEX "vendor_invoices_match_status_idx" ON "vendor_invoices"("match_status");

ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_po_id_fkey"
    FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- vendor_invoice_lines
CREATE TABLE "vendor_invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_invoice_id" UUID NOT NULL,
    "po_line_id" UUID,
    "grn_line_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14, 3) NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "tax_id" UUID,
    "line_total" INTEGER NOT NULL,
    CONSTRAINT "vendor_invoice_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vendor_invoice_lines" ADD CONSTRAINT "vendor_invoice_lines_vendor_invoice_id_fkey"
    FOREIGN KEY ("vendor_invoice_id") REFERENCES "vendor_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_invoice_lines" ADD CONSTRAINT "vendor_invoice_lines_po_line_id_fkey"
    FOREIGN KEY ("po_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendor_invoice_lines" ADD CONSTRAINT "vendor_invoice_lines_grn_line_id_fkey"
    FOREIGN KEY ("grn_line_id") REFERENCES "grn_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- vendor_payments
CREATE TABLE "vendor_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_number" TEXT NOT NULL,
    "vendor_id" UUID NOT NULL,
    "payment_date" DATE,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "bank_account_id" UUID,
    "voucher_id" UUID,
    "journal_id" UUID,
    "status" "VendorPaymentStatus" NOT NULL DEFAULT 'scheduled',
    "scheduled_date" DATE,
    "paid_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendor_payments_payment_number_key" ON "vendor_payments"("payment_number");

ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- vendor_payment_allocations
CREATE TABLE "vendor_payment_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_payment_id" UUID NOT NULL,
    "vendor_invoice_id" UUID NOT NULL,
    "allocated_amount" INTEGER NOT NULL,
    CONSTRAINT "vendor_payment_allocations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vendor_payment_allocations" ADD CONSTRAINT "vendor_payment_allocations_vendor_payment_id_fkey"
    FOREIGN KEY ("vendor_payment_id") REFERENCES "vendor_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_payment_allocations" ADD CONSTRAINT "vendor_payment_allocations_vendor_invoice_id_fkey"
    FOREIGN KEY ("vendor_invoice_id") REFERENCES "vendor_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- vendor_advances
CREATE TABLE "vendor_advances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_id" UUID NOT NULL,
    "po_id" UUID,
    "amount" INTEGER NOT NULL,
    "advance_date" DATE NOT NULL,
    "voucher_id" UUID,
    "journal_id" UUID,
    "adjusted_amount" INTEGER NOT NULL DEFAULT 0,
    "status" "VendorAdvanceStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_advances_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vendor_advances" ADD CONSTRAINT "vendor_advances_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_advances" ADD CONSTRAINT "vendor_advances_po_id_fkey"
    FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Organization settings (Phase 6)
ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "po_approval_threshold" INTEGER NOT NULL DEFAULT 5000000,
  ADD COLUMN IF NOT EXISTS "invoice_variance_tolerance_percent" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "grn_over_delivery_tolerance_percent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "auto_pr_on_low_stock_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "default_valuation_method" "ValuationMethod" NOT NULL DEFAULT 'weighted_average';

-- stock_movements is append-only (same pattern as audit_logs)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'sserp_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sserp_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sserp_app;
    REVOKE UPDATE, DELETE ON TABLE stock_movements FROM sserp_app;
    GRANT SELECT, INSERT ON TABLE stock_movements TO sserp_app;
  END IF;
END
$$;
