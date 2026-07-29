# Backend Phase 6 — Inventory & Procurement

| Field | Value |
|---|---|
| Duration | 4 weeks |
| Prerequisites | Phase 0, 1, 4 merged |
| Feature list coverage | 6.1–6.5 (Inventory), 7.1–7.5 (Procurement) |
| TDD sections | 7.3, 9.2 (GRN and stock events), 18.6.3 |

---

## 1. Objective and scope

Deliver the supply chain: an item and asset master, a movement-based stock ledger, half-yearly physical audits, vendor management, and the full purchase request → purchase order → goods receipt → vendor invoice → payment chain with three-way matching and budget enforcement at approval.

The design decision that drives this phase: **stock levels are never stored as a mutable number.** Every change is a `stock_movements` row and the current level is a maintained projection. This makes the audit discrepancy report and the stock movement report trivially correct and makes concurrent issue/receipt operations safe.

**In scope**

- Item master with categories, units, valuation method, minimum stock levels, photos
- Stock movements: receipt, issue, transfer, adjustment, return, disposal; real-time levels; low-stock alerts with optional auto-PR; expiry tracking for consumables
- Asset register: registration, assignment, return, condition, depreciation, disposal
- Half-yearly inventory audit: schedule, checklist, physical count, discrepancy report, sign-off, corrective actions
- Vendors: registration, categorisation, documents, performance rating, preferred list, blacklist
- Purchase requests with department review and principal approval
- Purchase orders from approved PRs, multi-item, multi-PR, amendment with versions, cancellation, vendor dispatch
- Goods receipt notes with partial delivery, quality rejection, automatic stock update
- Vendor invoices with three-way matching and AP posting; payment scheduling and recording

**Out of scope**

- Inventory and procurement reports (Phase 7)

---

## 2. Prerequisites

- Phase 4 `AccountsService`, `posting_rules`, `ap_ledger`, `BudgetCheckService`, `vouchers`.
- Phase 1 employees and departments for requester and approver resolution.

---

## 3. Prisma schema additions

### Inventory

#### `item_categories`
`id`, `name` (Therapy Tools & Instruments, Office Equipment, Furniture, IT Equipment, Consumables, Stationery), `parent_id`, `is_asset_category BOOLEAN`, `default_coa_expense_code`, `default_coa_asset_code`, `is_active`. Seeded with the six from feature 6.1.

#### `units_of_measure`
`id`, `code`, `name`, `allows_fraction BOOLEAN`.

#### `items`
`id`, `item_code` (unique), `name`, `description`, `category_id`, `unit_of_measure_id`, `item_nature` (`consumable`|`asset`|`spare`), `valuation_method` (`fifo`|`weighted_average`), `minimum_stock_level NUMERIC(14,3)`, `reorder_quantity NUMERIC(14,3)`, `maximum_stock_level`, `tracks_expiry BOOLEAN`, `tracks_serial BOOLEAN`, `manufacturer`, `brand`, `model`, `photo_attachment_id`, `standard_cost INTEGER`, `is_active`, `deleted_at`.

#### `locations`
`id`, `name`, `location_type` (`store`|`department`|`room`), `department`, `parent_id`, `is_active`. Stock is always held at a location; transfers move between locations.

#### `stock_movements`
The immutable append-only source of truth. `id`, `movement_number` (unique), `item_id`, `location_id`, `counter_location_id` (for transfers), `movement_type` (`receipt`|`issue`|`transfer_out`|`transfer_in`|`adjustment_increase`|`adjustment_decrease`|`return`|`disposal`|`opening`), `quantity NUMERIC(14,3)` (always positive; direction implied by type), `unit_cost INTEGER`, `total_cost INTEGER`, `batch_number`, `expiry_date`, `serial_number`, `reference_type` (`grn`|`issue_request`|`transfer`|`adjustment`|`audit`|`disposal`|`opening`), `reference_id`, `movement_date`, `journal_id`, `remarks`, `created_by`.

No `UPDATE` or `DELETE` is permitted; corrections are reversing movements. Enforced by a DB grant, exactly as with `audit_logs`.

#### `stock_levels`
Maintained projection, updated inside the same transaction as every movement. `id`, `item_id`, `location_id`, `quantity_on_hand NUMERIC(14,3)`, `quantity_reserved NUMERIC(14,3)`, `average_cost INTEGER`, `last_movement_at`. Unique `(item_id, location_id)`. Row-locked during movement processing.

#### `stock_batches`
For FIFO valuation and expiry tracking. `id`, `item_id`, `location_id`, `batch_number`, `expiry_date`, `received_quantity`, `remaining_quantity`, `unit_cost`, `received_date`, `grn_id`. FIFO issues consume the oldest non-expired batch first.

#### `stock_issue_requests`
`id`, `request_number`, `requested_by`, `department`, `to_location_id`, `purpose`, `status` (`pending`|`approved`|`issued`|`partially_issued`|`rejected`|`cancelled`), `approved_by`, `issued_by`, `issued_at`.

#### `stock_issue_request_lines`
`id`, `request_id`, `item_id`, `requested_quantity`, `approved_quantity`, `issued_quantity`.

#### `stock_adjustments`
`id`, `adjustment_number`, `location_id`, `adjustment_date`, `reason`, `adjustment_type` (`increase`|`decrease`), `status` (`draft`|`pending_approval`|`approved`|`rejected`), `approved_by`, `journal_id`, `audit_id` (set when the adjustment originates from an audit).

#### `stock_adjustment_lines`
`id`, `adjustment_id`, `item_id`, `system_quantity`, `adjusted_quantity`, `difference_quantity`, `unit_cost`, `remarks`.

### Assets

#### `assets`
`id`, `asset_code` (unique), `item_id`, `name`, `serial_number`, `purchase_date`, `purchase_cost INTEGER`, `supplier_vendor_id`, `grn_id`, `warranty_expiry_date`, `useful_life_months`, `salvage_value INTEGER`, `depreciation_method` (`straight_line`|`reducing_balance`), `depreciation_rate_percent`, `accumulated_depreciation INTEGER`, `net_book_value INTEGER`, `condition` (`new`|`good`|`fair`|`damaged`|`scrapped`), `status` (`in_store`|`assigned`|`under_repair`|`disposed`|`lost`), `current_location_id`, `current_assignee_employee_id`, `coa_asset_account_code`, `deleted_at`.

#### `asset_assignments`
`id`, `asset_id`, `assigned_to_type` (`employee`|`department`|`room`), `assigned_to_id`, `assigned_from`, `assigned_to_date`, `assigned_by`, `returned_at`, `return_condition`, `acknowledgement_attachment_id`, `notes`.

#### `asset_condition_logs`
`id`, `asset_id`, `logged_at`, `condition`, `notes`, `attachment_id`, `logged_by`.

#### `asset_depreciation_entries`
`id`, `asset_id`, `period_month`, `period_year`, `opening_nbv`, `depreciation_amount`, `closing_nbv`, `journal_id`, `computed_at`. Unique `(asset_id, period_year, period_month)`.

#### `asset_disposals`
`id`, `asset_id`, `disposal_date`, `disposal_type` (`sale`|`scrap`|`donation`|`write_off`|`lost`), `proceeds_amount`, `net_book_value_at_disposal`, `gain_loss_amount`, `reason`, `approved_by`, `journal_id`, `attachment_id`.

### Inventory audit

#### `inventory_audits`
`id`, `audit_number`, `audit_type` (`half_yearly`|`ad_hoc`|`cycle_count`), `period_label` (e.g. "H1 2026"), `scheduled_date`, `location_ids UUID[]`, `category_ids UUID[]`, `status` (`scheduled`|`in_progress`|`counted`|`reviewed`|`signed_off`|`cancelled`), `started_at`, `counted_by`, `reviewed_by`, `signed_off_by`, `signed_off_at`, `discrepancy_count`, `net_discrepancy_value INTEGER`, `notes`.

#### `inventory_audit_lines`
`id`, `audit_id`, `item_id`, `location_id`, `system_quantity NUMERIC(14,3)` (frozen snapshot at audit start), `physical_quantity NUMERIC(14,3)`, `difference_quantity`, `unit_cost`, `difference_value`, `discrepancy_type` (`match`|`surplus`|`shortage`), `counted_by`, `counted_at`, `explanation`.

#### `audit_corrective_actions`
`id`, `audit_id`, `audit_line_id`, `action_description`, `responsible_user_id`, `due_date`, `status` (`open`|`in_progress`|`completed`|`waived`), `completed_at`, `outcome_notes`.

### Procurement

#### `vendors`
`id`, `vendor_code` (unique), `name`, `vendor_type` (`supplier`|`service_provider`|`contractor`), `categories TEXT[]`, `contact_person`, `phone`, `email`, `address`, `tax_registration_number`, `bank_details JSONB`, `payment_terms_days`, `is_preferred`, `performance_score NUMERIC(4,2)`, `status` (`active`|`inactive`|`blacklisted`), `blacklist_reason`, `blacklisted_at`, `coa_payable_account_code`, `deleted_at`.

#### `vendor_documents`
`id`, `vendor_id`, `document_type` (`trade_license`|`tax_certificate`|`bank_letter`|`agreement`|`other`), `attachment_id`, `issued_date`, `expiry_date`.

#### `vendor_performance_ratings`
`id`, `vendor_id`, `po_id`, `delivery_timeliness_score`, `quality_score`, `pricing_score`, `responsiveness_score`, `overall_score`, `comments`, `rated_by`, `rated_at`.

#### `purchase_requests`
`id`, `pr_number` (unique), `requested_by`, `department`, `required_by_date`, `justification`, `estimated_total INTEGER`, `budget_line_id`, `status` (`draft`|`pending_dept_review`|`pending_principal_approval`|`approved`|`rejected`|`po_issued`|`partially_po_issued`|`closed`|`cancelled`), `dept_reviewed_by`, `dept_reviewed_at`, `dept_review_comment`, `approved_by`, `approved_at`, `approval_comment`, `rejection_reason`, `budget_check_result JSONB`, `attachment_id`.

#### `purchase_request_lines`
`id`, `pr_id`, `item_id` (nullable for free-text new items), `item_description`, `quantity NUMERIC(14,3)`, `unit_of_measure_id`, `estimated_unit_cost INTEGER`, `estimated_total INTEGER`, `po_issued_quantity NUMERIC(14,3)`, `remarks`.

#### `purchase_orders`
`id`, `po_number` (unique), `vendor_id`, `po_date`, `expected_delivery_date`, `delivery_address`, `payment_terms`, `subtotal_amount`, `tax_amount`, `discount_amount`, `total_amount`, `currency_code`, `version`, `previous_version_id`, `status` (`draft`|`pending_approval`|`approved`|`sent`|`partially_received`|`fully_received`|`closed`|`cancelled`), `approved_by`, `approved_at`, `sent_at`, `cancellation_reason`, `journal_id`, `document_attachment_id`, `created_by`.

#### `purchase_order_lines`
`id`, `po_id`, `pr_line_id` (nullable — links back for multi-PR POs), `item_id`, `item_description`, `quantity`, `unit_of_measure_id`, `unit_price INTEGER`, `tax_id`, `line_total INTEGER`, `received_quantity NUMERIC(14,3)`, `rejected_quantity NUMERIC(14,3)`, `invoiced_quantity NUMERIC(14,3)`.

#### `po_amendments`
`id`, `po_id`, `from_version`, `to_version`, `changes JSONB`, `reason`, `amended_by`, `approved_by`, `amended_at`.

#### `goods_receipt_notes`
`id`, `grn_number` (unique), `po_id`, `vendor_id`, `receipt_date`, `delivery_note_reference`, `received_at_location_id`, `is_partial BOOLEAN`, `status` (`draft`|`quality_check`|`accepted`|`partially_accepted`|`rejected`|`posted`), `received_by`, `quality_checked_by`, `posted_at`, `journal_id`, `attachment_id`, `remarks`.

#### `grn_lines`
`id`, `grn_id`, `po_line_id`, `item_id`, `ordered_quantity`, `received_quantity`, `accepted_quantity`, `rejected_quantity`, `rejection_reason`, `unit_cost INTEGER`, `batch_number`, `expiry_date`, `serial_numbers TEXT[]`, `stock_movement_id`.

#### `vendor_invoices`
`id`, `invoice_number`, `vendor_invoice_reference`, `vendor_id`, `po_id`, `grn_ids UUID[]`, `invoice_date`, `due_date`, `subtotal_amount`, `tax_amount`, `total_amount`, `matched_amount`, `variance_amount`, `match_status` (`unmatched`|`matched`|`variance_within_tolerance`|`variance_exceeded`), `status` (`draft`|`pending_approval`|`approved`|`rejected`|`partially_paid`|`paid`|`cancelled`), `approved_by`, `approved_at`, `rejection_reason`, `journal_id`, `attachment_id`.

#### `vendor_invoice_lines`
`id`, `vendor_invoice_id`, `po_line_id`, `grn_line_id`, `description`, `quantity`, `unit_price`, `tax_id`, `line_total`.

#### `vendor_payments`
`id`, `payment_number`, `vendor_id`, `payment_date`, `amount`, `method`, `reference`, `bank_account_id`, `voucher_id`, `journal_id`, `status` (`scheduled`|`paid`|`cancelled`), `scheduled_date`, `paid_by`.

#### `vendor_payment_allocations`
`id`, `vendor_payment_id`, `vendor_invoice_id`, `allocated_amount`. Supports one payment settling several invoices.

#### `vendor_advances`
`id`, `vendor_id`, `po_id`, `amount`, `advance_date`, `voucher_id`, `journal_id`, `adjusted_amount`, `status` (`open`|`partially_adjusted`|`fully_adjusted`|`refunded`).

### Indexes added

```
items (item_code), (category_id, is_active)
stock_movements (item_id, movement_date), (location_id, movement_date), (reference_type, reference_id)
stock_levels (item_id, location_id), (quantity_on_hand)
stock_batches (item_id, location_id, expiry_date), (remaining_quantity)
assets (asset_code), (status), (current_assignee_employee_id)
inventory_audit_lines (audit_id, discrepancy_type)
vendors (vendor_code), (status, is_preferred)
purchase_requests (status, created_at), (requested_by), (department, status)
purchase_orders (vendor_id, status), (po_date), (status)
grn_lines (po_line_id)
vendor_invoices (vendor_id, status), (due_date, status), (match_status)
```

---

## 4. Module and file structure

```
src/modules/inventory/
├── inventory.module.ts
├── controllers/
│   ├── item.controller.ts
│   ├── category.controller.ts
│   ├── location.controller.ts
│   ├── stock.controller.ts
│   ├── stock-issue.controller.ts
│   ├── stock-adjustment.controller.ts
│   ├── asset.controller.ts
│   └── audit.controller.ts
├── services/
│   ├── item.service.ts
│   ├── stock-movement.service.ts        # the only writer of stock_movements + stock_levels
│   ├── stock-valuation.service.ts       # FIFO / weighted average
│   ├── stock-level.service.ts           # projection queries, low-stock detection
│   ├── stock-issue.service.ts
│   ├── stock-adjustment.service.ts
│   ├── asset.service.ts
│   ├── depreciation.service.ts          # pure calculation
│   ├── asset-disposal.service.ts
│   └── inventory-audit.service.ts
├── listeners/grn-received.listener.ts
├── jobs/
│   ├── low-stock-check.job.ts
│   ├── expiry-alert.job.ts
│   ├── monthly-depreciation.job.ts
│   └── audit-schedule.job.ts
└── dto/

src/modules/procurement/
├── procurement.module.ts
├── controllers/
│   ├── vendor.controller.ts
│   ├── purchase-request.controller.ts
│   ├── purchase-order.controller.ts
│   ├── grn.controller.ts
│   ├── vendor-invoice.controller.ts
│   └── vendor-payment.controller.ts
├── services/
│   ├── vendor.service.ts
│   ├── vendor-performance.service.ts
│   ├── purchase-request.service.ts
│   ├── pr-approval.service.ts
│   ├── purchase-order.service.ts
│   ├── grn.service.ts
│   ├── three-way-match.service.ts       # pure calculation
│   ├── vendor-invoice.service.ts
│   └── vendor-payment.service.ts
├── jobs/{po-delivery-reminder,invoice-due-reminder}.job.ts
└── dto/
```

---

## 5. API endpoints

### Inventory master and stock

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/inventory/categories`, `/inventory/units`, `/inventory/locations` | super_admin, receptionist(store keeper), accountant |
| GET | `/inventory/items` | authenticated staff | Filter category, nature, low-stock |
| POST/PATCH | `/inventory/items` , `/inventory/items/:id` | receptionist, super_admin, accountant |
| GET | `/inventory/items/:id` | authenticated staff | With current levels per location |
| GET | `/inventory/stock-levels` | authenticated staff | Real-time levels |
| GET | `/inventory/stock-levels/low` | receptionist, accountant, principal | Below minimum |
| GET | `/inventory/items/:id/movements` | receptionist, accountant, principal | Movement ledger |
| GET | `/inventory/stock-valuation` | accountant, principal | Current valuation by method |
| GET | `/inventory/expiring` | receptionist, accountant | Consumables expiring within N days |
| GET/POST | `/inventory/issue-requests` | authenticated staff |
| POST | `/inventory/issue-requests/:id/approve` | department head, receptionist |
| POST | `/inventory/issue-requests/:id/issue` | receptionist | Creates issue movements |
| POST | `/inventory/transfers` | receptionist | Location-to-location transfer |
| GET/POST | `/inventory/adjustments` | receptionist, accountant |
| POST | `/inventory/adjustments/:id/approve` | principal, accountant | Posts the adjustment |

### Assets

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/inventory/assets` | receptionist, accountant, super_admin |
| GET | `/inventory/assets/:id` | authenticated staff |
| POST | `/inventory/assets/:id/assign` | receptionist, accountant |
| POST | `/inventory/assets/:id/return` | receptionist, accountant |
| POST | `/inventory/assets/:id/condition` | receptionist, accountant |
| GET | `/inventory/assets/:id/depreciation` | accountant, principal |
| POST | `/inventory/assets/depreciation/run` | accountant | Monthly run |
| POST | `/inventory/assets/:id/dispose` | principal, accountant | Reason mandatory |
| GET | `/inventory/asset-register` | accountant, principal |

### Inventory audit

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST | `/inventory/audits` | principal, accountant, coordinator |
| POST | `/inventory/audits/:id/start` | coordinator, accountant | Freezes the system snapshot |
| GET | `/inventory/audits/:id/checklist` | counters | Per category/location |
| PATCH | `/inventory/audits/:id/lines` | counters | Submit physical counts (batched) |
| POST | `/inventory/audits/:id/submit` | coordinator | → counted, computes discrepancies |
| GET | `/inventory/audits/:id/discrepancies` | principal, accountant, coordinator |
| POST | `/inventory/audits/:id/create-adjustments` | accountant | Generate adjustments from discrepancies |
| POST | `/inventory/audits/:id/sign-off` | principal | Final sign-off |
| GET/POST/PATCH | `/inventory/audits/:id/corrective-actions` | coordinator, principal |
| GET | `/inventory/audits/history` | principal, accountant, coordinator |

### Vendors

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/procurement/vendors` | accountant, receptionist, super_admin |
| POST | `/procurement/vendors/:id/blacklist` | principal | Reason mandatory |
| POST | `/procurement/vendors/:id/reactivate` | principal |
| GET/POST | `/procurement/vendors/:id/documents` | accountant, receptionist |
| GET/POST | `/procurement/vendors/:id/ratings` | accountant, principal |
| GET | `/procurement/vendors/preferred` | accountant, receptionist |

### Purchase requests

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/procurement/purchase-requests` | requester(own), department head, principal, accountant |
| POST | `/procurement/purchase-requests` | any authenticated staff |
| GET | `/procurement/purchase-requests/:id` | scoped |
| PATCH | `/procurement/purchase-requests/:id` | requester | Draft only |
| POST | `/procurement/purchase-requests/:id/submit` | requester |
| POST | `/procurement/purchase-requests/:id/dept-review` | department head, coordinator |
| POST | `/procurement/purchase-requests/:id/approve` | principal | Runs the budget check |
| POST | `/procurement/purchase-requests/:id/reject` | department head, principal | Reason mandatory |
| POST | `/procurement/purchase-requests/:id/cancel` | requester, principal |
| GET | `/procurement/purchase-requests/:id/budget-check` | department head, principal | Dry-run |

### Purchase orders

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/procurement/purchase-orders` | accountant, principal, receptionist |
| POST | `/procurement/purchase-orders` | accountant, receptionist | From one or more approved PRs |
| GET | `/procurement/purchase-orders/:id` | scoped |
| PATCH | `/procurement/purchase-orders/:id` | accountant | Draft only |
| POST | `/procurement/purchase-orders/:id/approve` | principal | Required above the threshold |
| POST | `/procurement/purchase-orders/:id/send` | accountant | Email or generate print PDF |
| POST | `/procurement/purchase-orders/:id/amend` | accountant | Creates a new version |
| POST | `/procurement/purchase-orders/:id/cancel` | principal, accountant | Reason mandatory |
| GET | `/procurement/purchase-orders/:id/document` | accountant, principal |
| GET | `/procurement/purchase-orders/:id/tracking` | accountant, principal | Received vs ordered vs invoiced |

### GRN

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST | `/procurement/grns` | receptionist, accountant |
| GET | `/procurement/grns/:id` | scoped |
| PATCH | `/procurement/grns/:id` | receptionist | Draft only |
| POST | `/procurement/grns/:id/quality-check` | receptionist, coordinator | Record accepted/rejected |
| POST | `/procurement/grns/:id/post` | receptionist, accountant | Creates stock movements and the journal |

### Vendor invoices and payments

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST | `/procurement/vendor-invoices` | accountant |
| GET | `/procurement/vendor-invoices/:id` | accountant, principal |
| GET | `/procurement/vendor-invoices/:id/match` | accountant | Three-way match result |
| POST | `/procurement/vendor-invoices/:id/approve` | accountant + principal above threshold | Posts to AP |
| POST | `/procurement/vendor-invoices/:id/reject` | accountant | Reason mandatory |
| GET/POST | `/procurement/vendor-payments` | accountant |
| POST | `/procurement/vendor-payments/:id/pay` | accountant | Posts payment, allocates to invoices |
| GET | `/procurement/vendors/:id/payment-history` | accountant, principal |
| GET/POST | `/procurement/vendor-advances` | accountant |

---

## 6. Business rules and invariants

### Stock

| # | Rule | Error |
|---|---|---|
| ST-01 | `stock_movements` is append-only. Corrections are reversing movements. Enforced by DB grant. | — |
| ST-02 | Every movement updates `stock_levels` in the same transaction, under a row lock on `(item_id, location_id)`. | — |
| ST-03 | `quantity_on_hand` may never go negative. An issue exceeding available stock is rejected. | `INSUFFICIENT_STOCK` 422 |
| ST-04 | Quantities on items whose unit does not allow fractions must be whole numbers. | `VALIDATION_ERROR` 400 |
| ST-05 | FIFO issue consumes the oldest non-expired batch first, splitting across batches when needed, and the issue's total cost equals the sum of the consumed batch costs exactly. | — |
| ST-06 | Weighted average recalculates `average_cost` on each receipt as `(existing_qty × existing_avg + received_qty × received_cost) ÷ (existing_qty + received_qty)`, rounded to the nearest paisa with the residual carried on the level row so valuation never drifts. | — |
| ST-07 | Transfers create a paired `transfer_out` and `transfer_in` in one transaction; total system quantity is unchanged. | — |
| ST-08 | Expired batches are not issuable. An attempt returns the expired batch details. | `BATCH_EXPIRED` 422 |
| ST-09 | Crossing below `minimum_stock_level` emits `inventory.stock.low` once per item per threshold crossing — not on every subsequent movement while low. | — |
| ST-10 | Auto-PR on low stock is opt-in per item category and creates a `draft` PR attributed to the store keeper, never an auto-approved one. | — |
| ST-11 | Consumable receipts and issues post to inventory asset and expense accounts respectively; the sum of movement journal values equals the change in stock valuation for the period. | — |

### Assets

| # | Rule | Error |
|---|---|---|
| AS-01 | An asset is created either from a GRN line for an asset-nature item or manually with a purchase cost. | — |
| AS-02 | An asset may have at most one active assignment. Assigning an already-assigned asset requires a return first. | `ASSET_ALREADY_ASSIGNED` 409 |
| AS-03 | Straight-line depreciation = `(purchase_cost − salvage_value) ÷ useful_life_months` per month, stopping when `net_book_value = salvage_value`. Reducing balance applies `depreciation_rate_percent` to the opening NBV, with the same floor. | — |
| AS-04 | Depreciation is idempotent per `(asset, year, month)` and never depreciates below salvage value or after disposal. | — |
| AS-05 | Disposal computes `gain_loss = proceeds − net_book_value` and posts accumulated depreciation removal, asset removal, proceeds, and gain or loss in one balanced journal. | — |
| AS-06 | A disposed asset cannot be assigned, depreciated, or counted in an audit. | `ASSET_DISPOSED` 409 |

### Inventory audit

| # | Rule | Error |
|---|---|---|
| IA-01 | The audit schedule job creates half-yearly audits automatically for H1 and H2 of each fiscal year. | — |
| IA-02 | Starting an audit **freezes** `system_quantity` on every line from the current `stock_levels`. Later movements do not change the frozen snapshot. | — |
| IA-03 | Physical count submission requires a value for every line before the audit can move to `counted`; partial submission keeps it `in_progress`. | `AUDIT_INCOMPLETE` 422 |
| IA-04 | `difference_quantity = physical − system`; `discrepancy_type` is `surplus` when positive, `shortage` when negative, `match` at zero. `difference_value = difference_quantity × unit_cost`. | — |
| IA-05 | Adjustments generated from an audit carry `audit_id` and, once approved, create the movements that reconcile system to physical. After approval, re-running the audit comparison must show zero discrepancy. | — |
| IA-06 | Sign-off requires `principal`, requires the audit to be `reviewed`, and requires every `shortage` line to have either an explanation or a corrective action. | `EXPLANATION_REQUIRED` 422 |
| IA-07 | A signed-off audit is immutable. | `AUDIT_SIGNED_OFF` 409 |

### Purchase requests

| # | Rule | Error |
|---|---|---|
| PR-01 | Any authenticated staff member may raise a PR. The requester's department is taken from their employee record, not from the request body. | — |
| PR-02 | Workflow: `draft → pending_dept_review → pending_principal_approval → approved`, with rejection possible at either review step. Skipping the department review is not permitted. | `INVALID_PR_TRANSITION` 409 |
| PR-03 | **Principal approval is mandatory** for every PR regardless of value (feature 7.1). There is no auto-approval path. | `FORBIDDEN` 403 |
| PR-04 | Principal approval runs `BudgetCheckService` against the mapped budget line. The result is stored on the PR. In `block` mode an overage prevents approval without an explicit principal override reason. | `BUDGET_EXCEEDED` 422 |
| PR-05 | A reviewer may not approve their own PR. | `SELF_APPROVAL_FORBIDDEN` 403 |
| PR-06 | Rejection at any level requires a reason and emits a status notification to the requester. | `VALIDATION_ERROR` 400 |
| PR-07 | Lines may reference an existing item or carry free text for a new item. Free-text lines require an item to be created before a PO line can be issued for a stock-tracked purchase. | `ITEM_REQUIRED` 422 |
| PR-08 | A PR closes when `po_issued_quantity = quantity` on every line, or manually with a reason. | — |
| PR-09 | Every status change emits `procurement.pr.status_changed` for the requester notification (feature 11.2). | — |

### Purchase orders

| # | Rule | Error |
|---|---|---|
| PO-01 | A PO may only be created from `approved` PR lines with remaining un-issued quantity. | `PR_NOT_APPROVED` 422 / `NO_REMAINING_QUANTITY` 422 |
| PO-02 | A single PO may draw lines from multiple PRs; a single PR may be split across multiple POs. `po_issued_quantity` on the PR line is maintained accordingly and may never exceed the requested quantity. | `EXCEEDS_REQUESTED_QUANTITY` 422 |
| PO-03 | The vendor must be `active` and not blacklisted. | `VENDOR_UNAVAILABLE` 422 |
| PO-04 | POs at or above `organization_settings.po_approval_threshold` require `principal` approval; below it, the accountant's creation is sufficient. | `PO_APPROVAL_REQUIRED` 409 |
| PO-05 | A PO can only be sent when `approved`. | `PO_NOT_APPROVED` 409 |
| PO-06 | Amendment increments `version`, snapshots the previous version, records the reason, and requires re-approval if the total increases above the threshold. Amendment is blocked once any quantity has been received. | `PO_PARTIALLY_RECEIVED` 409 |
| PO-07 | Cancellation is blocked once any quantity has been received; a reason is mandatory. | `PO_PARTIALLY_RECEIVED` 409 |
| PO-08 | PO approval posts a commitment entry only if commitment accounting is enabled; by default it does not post, and AP arises at invoice approval. Documented in `docs/adr/0004-po-commitment-accounting.md`. | — |

### GRN

| # | Rule | Error |
|---|---|---|
| GR-01 | A GRN must reference an `approved` or `sent` PO that is not fully received. | `PO_NOT_RECEIVABLE` 422 |
| GR-02 | `received_quantity` per line may not exceed `ordered − already_received`, plus an over-delivery tolerance configurable per organisation (default 0%). | `EXCEEDS_ORDERED_QUANTITY` 422 |
| GR-03 | Partial delivery is supported: multiple GRNs against one PO. The PO status moves to `partially_received` then `fully_received`. | — |
| GR-04 | `accepted_quantity + rejected_quantity = received_quantity`. Rejections require a reason. | `VALIDATION_ERROR` 400 |
| GR-05 | **Only `accepted_quantity` increases stock.** Rejected quantities create no movement and remain available on the PO for re-delivery. | — |
| GR-06 | Posting a GRN is transactional: create stock movements for accepted lines, create batches where expiry or serial tracking applies, create asset records for asset-nature items, update PO line received quantities, and post the inventory journal. Either all of it happens or none. | — |
| GR-07 | Posting is idempotent — a posted GRN cannot be posted twice. | `GRN_ALREADY_POSTED` 409 |
| GR-08 | Items with `tracks_expiry` require an expiry date on the GRN line; `tracks_serial` requires one serial number per received unit. | `EXPIRY_REQUIRED` 422 / `SERIAL_COUNT_MISMATCH` 422 |
| GR-09 | Posting emits `inventory.grn.received`. | — |

### Three-way matching and payment

| # | Rule | Error |
|---|---|---|
| TW-01 | Matching compares PO line unit price and quantity, GRN accepted quantity, and invoice line quantity and price. The invoice's matched amount is `Σ min(accepted_qty, invoiced_qty) × po_unit_price`. | — |
| TW-02 | `variance_amount = invoice_total − matched_amount`. A variance within `organization_settings.invoice_variance_tolerance_percent` (default 2%) is flagged `variance_within_tolerance` and may be approved. Beyond it, `variance_exceeded` blocks approval without a principal override. | `INVOICE_VARIANCE_EXCEEDED` 422 |
| TW-03 | Invoicing a quantity greater than the accepted quantity is always blocked, regardless of tolerance. | `EXCEEDS_ACCEPTED_QUANTITY` 422 |
| TW-04 | Invoice approval posts to AP: debit the expense or inventory-in-transit clearing account, credit accounts payable, with tax handled per the line's tax configuration. It creates the `ap_ledger` row. | — |
| TW-05 | Payment may not exceed the invoice outstanding amount; a single payment may be allocated across several invoices, and the sum of allocations must equal the payment amount. | `ALLOCATION_MISMATCH` 422 |
| TW-06 | Vendor advances are adjustable against invoices of the same vendor; the adjusted amount may not exceed the advance. | `EXCEEDS_ADVANCE` 422 |
| TW-07 | Payment to a blacklisted vendor requires principal override with a reason. | `VENDOR_BLACKLISTED` 422 |
| TW-08 | Every procurement money movement posts through `AccountsService` in the caller's transaction. | — |

---

## 7. Domain events

**Emitted:** `procurement.pr.submitted`, `procurement.pr.status_changed`, `procurement.pr.approved`, `procurement.pr.rejected`, `procurement.po.created`, `procurement.po.approved`, `procurement.po.sent`, `procurement.po.cancelled`, `inventory.grn.received`, `procurement.invoice.approved`, `procurement.payment.made`, `inventory.stock.low`, `inventory.stock.expiring`, `inventory.adjustment.approved`, `inventory.audit.scheduled`, `inventory.audit.signed_off`, `asset.assigned`, `asset.disposed`, `vendor.blacklisted`, `vendor.document.expiring`.

**Consumed**

| Event | Handler | Action |
|---|---|---|
| `inventory.grn.received` | `GrnReceivedListener` (Inventory) | Already handled inside the GRN post transaction; the listener maintains derived projections and emits low-stock recomputation |
| `inventory.stock.low` | Procurement + Notifications | Alert the procurement officer; optionally create a draft PR |
| `procurement.invoice.approved` | Accounts | Maintain `ap_ledger` |

### Ledger postings added

| Trigger | Debit | Credit | Cost center |
|---|---|---|---|
| GRN posted (consumable) | `1410 Inventory` | `2020 GRN Clearing` | requesting department |
| GRN posted (asset) | `1510 Fixed Assets` | `2020 GRN Clearing` | requesting department |
| Vendor invoice approved | `2020 GRN Clearing` + `1450 Input Tax` | `2010 Accounts Payable` | requesting department |
| Vendor payment | `2010 Accounts Payable` | `1010 Cash` / `1020 Bank` | admin |
| Vendor advance | `1320 Vendor Advance` | `1020 Bank` | admin |
| Stock issue to department | `5040 Consumables Expense` | `1410 Inventory` | consuming department |
| Stock adjustment increase | `1410 Inventory` | `5045 Inventory Gain` | admin |
| Stock adjustment decrease | `5046 Inventory Loss` | `1410 Inventory` | admin |
| Monthly depreciation | `5050 Depreciation Expense` | `1520 Accumulated Depreciation` | owning department |
| Asset disposal | `1520 Accumulated Depreciation` + `1010 Cash` (proceeds) + `5055 Loss on Disposal` | `1510 Fixed Assets` + `4090 Gain on Disposal` | admin |

The GRN clearing account is what makes three-way matching auditable: stock arrives on receipt, the liability arises on invoice approval, and the clearing account nets to zero once both sides land. A nightly check reports any clearing balance older than 30 days.

---

## 8. Background jobs and cron

| Job | Schedule | Purpose |
|---|---|---|
| `low-stock-check` | Daily 06:30 | Detect threshold crossings, emit alerts, optionally raise draft PRs |
| `expiry-alert` | Daily 06:45 | Alert on batches expiring within 30 and 7 days |
| `monthly-depreciation` | Last day of month 23:30 | Compute and post depreciation for all active assets |
| `audit-schedule` | Yearly | Create the two half-yearly audits |
| `po-delivery-reminder` | Daily 08:00 | Remind on POs past their expected delivery date |
| `invoice-due-reminder` | Daily 08:15 | Remind on vendor invoices due within 7 days |
| `vendor-document-expiry` | Weekly | Alert on expiring trade licences and tax certificates |
| `grn-clearing-review` | Weekly | Report clearing-account balances older than 30 days |

Queue added: `supply-chain`.

---

## 9. Configuration and secrets

New settings:

- `organization_settings.po_approval_threshold` (amount above which principal approval is required)
- `organization_settings.invoice_variance_tolerance_percent` (default 2)
- `organization_settings.grn_over_delivery_tolerance_percent` (default 0)
- `organization_settings.auto_pr_on_low_stock_enabled` (default false)
- `organization_settings.default_valuation_method` (`weighted_average`)

---

## 10. Tests owed by this phase

### Factories added

`itemCategoryFactory`, `itemFactory` (`consumableItem`, `assetItem`, `expiryTrackedItem` traits), `locationFactory`, `stockMovementFactory`, `stockBatchFactory`, `assetFactory`, `auditFactory`, `auditLineFactory`, `vendorFactory` (`blacklistedVendor`, `preferredVendor`), `purchaseRequestFactory`, `purchaseOrderFactory`, `grnFactory`, `vendorInvoiceFactory`.

### Unit tests — `StockMovementService` / `StockValuationService`

- Receipt then issue leaves the correct on-hand quantity.
- Issue exceeding stock rejected.
- Fractional quantity on a whole-unit item rejected.
- FIFO across three batches: issue spanning two batches consumes the oldest fully then partially the next, and the total cost equals the sum of the consumed portions to the paisa.
- FIFO skips expired batches.
- Weighted average: a table-driven sequence of five receipts and three issues, asserting `average_cost` and total valuation at each step with no cumulative rounding drift.
- Transfer leaves total system quantity unchanged.
- Low-stock event fires exactly once on the crossing and not on subsequent movements while still low, and fires again after recovery and a second crossing.
- Every movement type produces the documented journal with balancing lines.

### Unit tests — `DepreciationService` (pure)

- Straight-line over 36 months reaches exactly salvage value in month 36 with no residual paisa.
- Reducing balance never crosses below salvage value.
- Idempotent per month.
- No depreciation after disposal.
- A mid-month purchase starts depreciation the following month (documented convention).

### Unit tests — `InventoryAuditService`

- Starting freezes the snapshot; a subsequent movement does not change `system_quantity`.
- Surplus, shortage, and match classification with correct values.
- Submission with a missing count keeps the audit `in_progress`.
- Sign-off without an explanation on a shortage line rejected.
- Sign-off by a non-principal rejected.
- Generated adjustments reconcile system to physical, verified by recomputing discrepancies after approval and asserting zero.
- A signed-off audit rejects further line edits.

### Unit tests — `PurchaseRequestService` / `PrApprovalService`

- Every legal transition succeeds; skipping the department review rejected.
- Self-approval rejected.
- Rejection without a reason rejected.
- Budget overage blocks approval in `block` mode and permits it with a principal override reason.
- `po_issued_quantity` never exceeds the requested quantity across two partial POs.
- PR closes automatically when all lines are fully issued.

### Unit tests — `PurchaseOrderService`

- PO from a non-approved PR rejected.
- Multi-PR PO correctly updates each source PR line.
- Blacklisted vendor rejected.
- Above-threshold PO requires approval; below-threshold does not.
- Amendment after partial receipt rejected.
- Cancellation after partial receipt rejected.
- Amendment increments version and preserves the previous snapshot.

### Unit tests — `GrnService`

- Over-receipt beyond tolerance rejected; within tolerance accepted.
- `accepted + rejected ≠ received` rejected.
- Only accepted quantity creates movements — asserted by inspecting the movement quantities.
- Rejected quantity remains available on the PO for a second GRN.
- Expiry-tracked item without an expiry date rejected.
- Serial-tracked item with a serial count mismatch rejected.
- Asset-nature item creates one asset record per received unit.
- Double posting rejected.
- Partial deliveries move the PO through `partially_received` to `fully_received`.

### Unit tests — `ThreeWayMatchService` (pure)

Table-driven across the match matrix:

- Exact match on price and quantity → `matched`.
- Invoice quantity below accepted → matched at the lower quantity, variance negative within tolerance.
- Invoice price 1% above PO → `variance_within_tolerance`.
- Invoice price 5% above PO → `variance_exceeded`.
- Invoice quantity above accepted → always blocked regardless of tolerance.
- Multi-line invoice with one variant line → status reflects the worst line.
- Tax-inclusive lines decomposed before comparison.

### Integration tests

| Suite | Assertions |
|---|---|
| `pr-po-grn-chain.integration.spec.ts` | Full chain: raise PR → dept review → principal approve → PO → send → GRN with partial delivery → post → assert stock level increments by the accepted quantity only → second GRN completes the PO (mirrors PRO-E2E-01) |
| `pr-budget-rejection.integration.spec.ts` | PR exceeding the budget shows the warning, principal rejects, assert no PO exists and stock is unchanged (mirrors PRO-E2E-02) |
| `grn-atomicity.integration.spec.ts` | Force a failure during asset creation and assert no stock movement, no PO line update, and no journal were persisted |
| `three-way-match.integration.spec.ts` | Invoice with an out-of-tolerance variance is blocked at approval; a principal override records the reason and posts to AP |
| `inventory-audit.integration.spec.ts` | Schedule → start → count with deliberate surplus and shortage → submit → discrepancy report correct → generate adjustments → approve → recount shows zero discrepancy → sign-off (mirrors INV-E2E-01) |
| `stock-concurrency.integration.spec.ts` | 10 parallel issues for an item with stock for only 6 → exactly 6 succeed, 4 return `INSUFFICIENT_STOCK`, and on-hand ends at zero |
| `low-stock-auto-pr.integration.spec.ts` | Issue stock below the minimum, run the job, assert exactly one alert and one draft PR, then a second issue produces no duplicate |
| `depreciation-run.integration.spec.ts` | Run depreciation for 12 consecutive months on 20 assets, assert NBV, journal count, and idempotency on a repeat run |
| `asset-disposal.integration.spec.ts` | Dispose at a gain and at a loss; assert balanced journals and the correct gain/loss account |
| `grn-clearing.integration.spec.ts` | After GRN post and invoice approval, the clearing account nets to zero for that PO |
| `procurement-rbac.integration.spec.ts` | A teacher can raise a PR but cannot approve one, cannot create a PO, and cannot post a GRN |

### Performance tests

- `k6/scripts/stock-level-load.js` — `GET /inventory/stock-levels` with 2,000 items across 10 locations, 30 VU, p95 < 300 ms.
- `k6/scripts/grn-post.js` — GRN posting with 30 lines, 15 VU, asserting transactional throughput and no deadlocks.

### Mutation testing

`StockMovementService`, `StockValuationService`, `DepreciationService`, `InventoryAuditService`, `PrApprovalService`, `GrnService`, `ThreeWayMatchService` at ≥ 75%. The pure services (`DepreciationService`, `ThreeWayMatchService`) target ≥ 90%.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] `stock_movements` cannot be updated or deleted through the application DB role — proven by test.
- [ ] The stock concurrency test passes 20 consecutive runs with no negative stock and no flake.
- [ ] FIFO and weighted-average valuations reconcile exactly to the sum of movement costs, with no rounding drift across a 50-movement sequence.
- [ ] The audit reconciliation loop (count → adjust → recount = zero discrepancy) passes.
- [ ] The GRN clearing account nets to zero for every completed PO in the integration dataset.
- [ ] Three-way match blocks over-invoicing beyond accepted quantity in all cases, including within-tolerance price variances.
- [ ] Principal approval is required for 100% of PRs — verified by attempting approval as every other role.
- [ ] All procurement and inventory journals balance, verified by running the Phase 4 integrity job after this phase's suite.
