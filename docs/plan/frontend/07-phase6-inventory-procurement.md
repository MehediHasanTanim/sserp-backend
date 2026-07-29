# Frontend Phase 6 — Inventory & Procurement

| Field | Value |
|---|---|
| Duration | 4 weeks |
| Prerequisites | Frontend Phase 0, 1, 4; Backend Phase 6 contract published |
| Feature list coverage | 6.1–6.5 (Inventory), 7.1–7.5 (Procurement) |
| Backend counterpart | [backend/07-phase6-inventory-procurement.md](../backend/07-phase6-inventory-procurement.md) |

---

## 1. Objective and scope

Build the supply chain interface. Two ideas from the backend design shape every screen here.

First, **stock is a ledger, not a number.** The backend never mutates a stored quantity; it appends movements and maintains a projection. The UI should reflect that honestly: every quantity shown is drillable to the movements that produced it. A storekeeper who cannot answer "why does the system think I have 14 of these" will stop trusting the system and go back to a spreadsheet.

Second, **the procurement chain is a chain.** A purchase request becomes a purchase order, which becomes goods received, which becomes an invoice, which becomes a payment. At any point in that chain the user needs to see both directions — what came before and what has happened since. Every document page carries a chain widget rather than leaving the user to search.

**In scope**

- Item master with categories, units, locations, valuation, minimum levels, photos
- Stock views: levels by item and location, movement ledger, low-stock alerts
- Stock operations: issue requests and issuing, transfers, adjustments with approval, returns, disposals
- Batch and expiry tracking with expiry alerts
- Asset register: registration, assignment and return, condition, depreciation schedule, disposal
- Half-yearly inventory audit: schedule, count sheet entry, discrepancy report, sign-off, corrective actions
- Vendors: registration, documents, categorisation, performance rating, preferred and blacklist management
- Purchase requests with review and approval
- Purchase orders including multi-PR consolidation, amendment with versions, cancellation, vendor dispatch
- Goods receipt notes with partial receipt and quality rejection
- Vendor invoices with the three-way match result surfaced, and payment scheduling

**Out of scope**

- Inventory and procurement reports and dashboard tiles — Phase 7

---

## 2. Prerequisites

- Phase 4 `MoneyDisplay`, `MoneyInput`, `BudgetCheckIndicator`, `AgingTable` patterns, and `invalidateAccountingViews()`.
- Phase 1 employee and department selectors for requester and approver fields.
- Backend Phase 6 contract, including the three-way match result shape and the stock availability check endpoint.

---

## 3. Routes and page tree

```
app/(app)/inventory/
├── items/
│   ├── page.tsx                          # master list
│   ├── new/page.tsx
│   └── [id]/
│       ├── page.tsx                      # detail + levels by location
│       ├── movements/page.tsx             # per-item ledger
│       └── batches/page.tsx
├── categories/page.tsx
├── locations/page.tsx
├── units/page.tsx
├── stock/
│   ├── page.tsx                          # levels grid (item × location)
│   ├── movements/page.tsx                # global ledger
│   ├── low-stock/page.tsx
│   ├── expiring/page.tsx
│   ├── issues/
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx                 # approve + issue
│   ├── transfers/
│   │   ├── page.tsx
│   │   └── new/page.tsx
│   ├── adjustments/
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx
│   ├── returns/page.tsx
│   └── disposals/page.tsx
├── assets/
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/
│       ├── page.tsx
│       ├── assignments/page.tsx
│       ├── maintenance/page.tsx
│       └── depreciation/page.tsx
└── audits/
    ├── page.tsx
    ├── new/page.tsx
    └── [id]/
        ├── page.tsx                      # audit header + progress
        ├── count/page.tsx                # count sheet entry
        ├── discrepancies/page.tsx
        └── sign-off/page.tsx

app/(app)/procurement/
├── vendors/
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/
│       ├── page.tsx
│       ├── documents/page.tsx
│       ├── performance/page.tsx
│       └── transactions/page.tsx
├── requests/
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/page.tsx
├── orders/
│   ├── page.tsx
│   ├── new/page.tsx                      # from approved PRs
│   └── [id]/
│       ├── page.tsx
│       ├── amend/page.tsx
│       └── versions/page.tsx
├── grn/
│   ├── page.tsx
│   ├── new/page.tsx                      # against a PO
│   └── [id]/page.tsx
└── invoices/
    ├── page.tsx
    ├── new/page.tsx                      # against a PO/GRN
    └── [id]/page.tsx                     # match result + approval
```

---

## 4. Component inventory

### The document chain widget

`ProcurementChain` appears on the detail page of every procurement document — PR, PO, GRN, invoice, payment.

- Renders the chain as a labelled sequence with the current document highlighted, each prior document linked, and each downstream document linked with its status.
- Where a downstream document does not exist yet, it shows what the next step is and who can perform it, rather than showing nothing. A user looking at an approved PR with no PO should learn that a PO is the next step and that procurement staff create it.
- Handles fan-out honestly: one PR may feed several POs, one PO may have several GRNs and several invoices. The widget lists them rather than pretending the chain is linear.

This single component removes most of the "where is my order" support burden.

### Item master and stock

| Component | Notes |
|---|---|
| `ItemTable` | Code, name, category, unit, total on-hand across locations, minimum level, and a low-stock indicator stated in text as well as colour. Filterable by category, nature, and low-stock status. |
| `ItemForm` | Code, name, category, unit, nature, valuation method, minimum and reorder and maximum levels, expiry and serial tracking flags, manufacturer details, standard cost, photo upload. Setting a minimum level explains that it drives the low-stock alert. |
| `ItemDetailHeader` | Photo, identity fields, and total on-hand with a per-location breakdown table. |
| `StockLevelGrid` | Items as rows, locations as columns, on-hand quantities in cells with reserved quantities shown separately where non-zero. Every cell is a link into the filtered movement ledger for that item and location — this is the drill-through that makes the projection trustworthy. |
| `StockMovementLedger` | Date, movement number, type, item, location, counter-location, signed quantity, unit cost, running balance where filtered to a single item and location, reference link, and actor. Filterable by item, location, type, and date range. The reference link goes to the GRN, issue, transfer, adjustment, or audit that caused it. |
| `MovementTypeBadge` | The nine movement types with distinct labels; direction is conveyed by the label and a sign, never by colour alone. |
| `LowStockPanel` | Items below minimum with the shortfall, the reorder quantity, and an action to raise a purchase request pre-filled from the item — turning an alert into a next step rather than a notification. |
| `ExpiryAlertPanel` | Batches expiring within the configured window, grouped by urgency band, with quantity and location, and a disposal action. |
| `BatchTable` | Batch number, expiry, received and remaining quantity, unit cost, received date, GRN link. |

### Stock operations

| Component | Notes |
|---|---|
| `IssueRequestForm` | Requester, department, destination location, purpose, and item lines with requested quantities. Each line shows the **available quantity at the source location live**, so a request for stock that does not exist is discouraged at entry rather than rejected at issue. |
| `IssueApprovalPanel` | Approver adjusts approved quantities per line, with the requested quantity and availability both visible. A partial approval requires no explanation but a zero-approval line requires a remark. |
| `IssuePanel` | Storekeeper records issued quantities, batch selection where the item tracks batches (FIFO batch pre-selected with the ability to override and a reason), and completes the issue. Issuing more than approved is blocked with the approved figure stated. |
| `TransferForm` | Source and destination locations, item lines with available quantity at source shown per line, batch selection where applicable. Same-location transfer blocked. |
| `AdjustmentForm` | Location, date, reason, type, and lines showing the system quantity read-only alongside the adjusted quantity input with a computed difference column. Showing the system quantity is essential: an adjustment is a statement about a discrepancy, and the user must see what they are correcting. |
| `AdjustmentApprovalBar` | Submit and approve; the approval dialog shows the total value impact and the journal that will post. |
| `ReturnForm` | Original issue reference, item lines with returnable quantities, condition per line. |
| `DisposalForm` | Item, quantity, batch, reason, approval requirement stated, and the write-off posting preview. |

### Assets

| Component | Notes |
|---|---|
| `AssetTable` | Asset tag, item, location, current holder, condition, acquisition date, book value, status. Filterable by category, location, holder, and condition. |
| `AssetForm` | Item link, asset tag, serial, acquisition date and cost, useful life, salvage value, depreciation method, location, warranty expiry. |
| `AssetAssignmentPanel` | Current assignment with holder and date; assign and return actions. Assigning an already-assigned asset is blocked with the current holder named — a common real-world error. |
| `AssetConditionForm` | Condition grade with notes and photo attachment. |
| `AssetDepreciationSchedule` | Period, opening book value, depreciation, closing book value, and the posted journal link per period. |
| `AssetDisposalDialog` | Method, proceeds, date; shows the gain or loss on disposal computed against book value and the resulting posting, so the accounting effect is visible to the person disposing. |
| `AssetMaintenanceLog` | Date, type, cost, vendor, notes, next-due date with an overdue indicator. |

### Inventory audit

| Component | Notes |
|---|---|
| `AuditScheduleForm` | Period (half-yearly by default per the feature list), locations, categories in scope, audit team, planned dates. |
| `AuditProgressHeader` | Items in scope, counted, remaining, discrepancies found — always visible during counting so the team knows how much is left. |
| `CountSheetGrid` | One row per item in scope: item, location, unit, counted quantity input, and a remarks field. **The system quantity is deliberately hidden during counting** and revealed only in the discrepancy report, because showing it invites the counter to confirm the system rather than count the shelf. This is the single most important design decision in the audit flow and is stated in the UI so the team understands why. |
| `CountSheetPrintView` | A printable sheet for offline counting, since store rooms often lack reliable connectivity. |
| `DiscrepancyReport` | Item, system quantity, counted quantity, difference quantity and value, with a reason input per discrepancy line and a total value impact. Sortable by absolute value impact, so the largest problems are addressed first. |
| `AuditSignOffPanel` | Reviewer and approver sign-off with the discrepancy summary restated, and an action to generate the corrective stock adjustment. Sign-off is blocked while any discrepancy lacks a reason. |
| `CorrectiveActionList` | Actions arising from the audit with owner, due date, and status. |

### Vendors

| Component | Notes |
|---|---|
| `VendorTable` | Name, code, categories, rating, preferred and blacklisted indicators, outstanding payable. Blacklisted vendors are visually distinct and sorted normally rather than hidden, since users need to see why a vendor is unavailable. |
| `VendorForm` | Identity, contact, tax identifiers, bank details, payment terms, categories. |
| `VendorDocumentPanel` | Document type, number, issue and expiry dates, attachment, with an expiry indicator. |
| `VendorPerformancePanel` | Ratings across delivery timeliness, quality, and pricing, with the aggregate score, the rating history, and the underlying order count. A rating with no visible basis is not credible. |
| `VendorBlacklistDialog` | Reason required; states that the vendor will be unavailable for new POs and that existing open POs are unaffected. |
| `VendorTransactionPanel` | POs, GRNs, invoices, and payments for the vendor with outstanding balance. |

### Procurement documents

| Component | Notes |
|---|---|
| `PurchaseRequestForm` | Department, required-by date, justification, and item lines with quantity, estimated unit cost, and a line total. A running estimated total, and the `BudgetCheckIndicator` for the selected cost center and expense account so the requester sees remaining budget before submitting. Items below minimum stock show a low-stock hint on the line. |
| `PurchaseRequestApprovalBar` | Department review then principal approval, with the budget check re-evaluated at approval time and the result shown to the approver — a stale requester-side check is not enough. |
| `POCreateWizard` | Step 1 selects approved PR lines, filterable across multiple PRs and consolidating identical items with the source PRs listed per line. Step 2 selects the vendor, showing rating and preferred status, and blocking blacklisted vendors with the reason. Step 3 sets prices, tax, delivery terms, and shows the total with the budget check. The consolidation step is where procurement earns its value, so it is a first-class flow rather than a per-PR conversion. |
| `PurchaseOrderDetail` | Header with vendor, status, version, and totals; line table with ordered, received, and invoiced quantities per line; the `ProcurementChain`; and the actions available. The three-quantity line view is what lets a user see at a glance that an order is partially fulfilled. |
| `POAmendmentForm` | Editable lines with a per-line delta column against the current version, a mandatory reason, and a statement that a new version will be created and the previous version retained. Amendment is blocked once any line is fully received, with the reason given. |
| `POVersionHistory` | Version list with dates, actors, reasons, and a diff view between any two versions. |
| `PODispatchDialog` | Sends the PO to the vendor; shows the recipient address and attaches the generated PDF, with the dispatch recorded. |
| `POCancelDialog` | Reason required; blocked if any receipt exists, with the GRN named. |
| `GRNForm` | PO selection, then lines pre-filled with the outstanding ordered quantity. Per line: received quantity, accepted quantity, rejected quantity with a rejection reason, batch number and expiry where the item tracks them, and serial numbers where tracked. Accepted plus rejected must equal received, validated live with the difference shown. A short receipt is normal and does not require justification, but an over-receipt beyond tolerance is blocked with the tolerance stated. |
| `GRNDetail` | Received lines, the stock movements created with links into the ledger, the quality rejection summary, and the chain. Seeing the movements created by a GRN closes the loop between procurement and inventory. |
| `VendorInvoiceForm` | Vendor, invoice number and date, PO and GRN references, lines with quantity and rate, tax, and total. |
| `ThreeWayMatchPanel` | The heart of invoice approval. Three columns — ordered, received, invoiced — per line, with the variance per line and an overall match verdict. Matched lines are collapsed by default and mismatched lines expanded, because the user's attention belongs on the exceptions. Each mismatch states its type: quantity variance, price variance, or an invoice for goods not received. Approval of a mismatched invoice requires an explicit override with a reason and is limited to the permitted role. |
| `InvoiceApprovalBar` | Approve or reject, with the match verdict restated in the confirmation and the AP posting previewed. |
| `PaymentScheduleForm` | Reused from Phase 4 payables with the vendor and invoice pre-filled. |

---

## 5. Server state

### Query keys

```typescript
inventory: {
  items: (f) => [...], item: (id) => [...], categories: [...], locations: [...], units: [...],
  levels: (f) => [...], levelForItem: (itemId) => [...],
  movements: (f) => [...], itemMovements: (itemId, f) => [...],
  availability: (itemId, locationId) => [...],
  batches: (itemId) => [...], lowStock: [...], expiring: (days) => [...],
  issues: (f) => [...], issue: (id) => [...],
  transfers: (f) => [...], adjustments: (f) => [...], adjustment: (id) => [...],
  returns: (f) => [...], disposals: (f) => [...],
  assets: (f) => [...], asset: (id) => [...], assetAssignments: (id) => [...],
  assetDepreciation: (id) => [...], assetMaintenance: (id) => [...],
  audits: (f) => [...], audit: (id) => [...], auditCountSheet: (id) => [...],
  auditDiscrepancies: (id) => [...], auditActions: (id) => [...],
},
procurement: {
  vendors: (f) => [...], vendor: (id) => [...], vendorDocuments: (id) => [...],
  vendorPerformance: (id) => [...], vendorTransactions: (id) => [...],
  requests: (f) => [...], request: (id) => [...], approvedRequestLines: (f) => [...],
  orders: (f) => [...], order: (id) => [...], orderVersions: (id) => [...],
  grns: (f) => [...], grn: (id) => [...],
  invoices: (f) => [...], invoice: (id) => [...], matchResult: (invoiceId) => [...],
  chain: (docType, docId) => [...],
}
```

### The availability query

`useAvailability(itemId, locationId)` backs the live availability display on issue, transfer, and disposal lines.

- `staleTime: 0` — stock availability is the one figure that must never be stale, because acting on a stale number causes a real-world error.
- Enabled only when both the item and location are selected.
- Invalidated by every movement-creating mutation.

### Invalidation

| Mutation | Invalidates |
|---|---|
| Item create or update | `items`, `item`, `levels` (minimum level affects the low-stock derivation), `lowStock` |
| Issue request submit | `issues` |
| Issue approve | `issues`, `issue` |
| **Issue (stock out)** | `issues`, `issue`, `levels`, `levelForItem`, `movements`, `itemMovements`, `availability`, `batches`, `lowStock` |
| Transfer | `levels`, `levelForItem`, `movements`, `availability`, `batches` for both locations |
| Adjustment approve | `levels`, `movements`, `availability`, `batches`, `adjustments`, `adjustment`, `invalidateAccountingViews()` |
| Return | `levels`, `movements`, `availability`, `batches`, `returns` |
| Disposal | `levels`, `movements`, `availability`, `batches`, `disposals`, `expiring`, `invalidateAccountingViews()` |
| Asset assign or return | `assets`, `asset`, `assetAssignments` |
| Asset disposal | `assets`, `asset`, `assetDepreciation`, `invalidateAccountingViews()` |
| Depreciation run | `assets`, `assetDepreciation`, `invalidateAccountingViews()` |
| Audit count save | `auditCountSheet`, `audit` (progress figures) |
| Audit sign-off with corrective adjustment | `audits`, `audit`, `auditDiscrepancies`, `adjustments`, `levels`, `movements`, `invalidateAccountingViews()` |
| Vendor blacklist | `vendors`, `vendor` |
| Vendor rating | `vendorPerformance`, `vendors` |
| PR approve | `requests`, `request`, `approvedRequestLines`, `budgets.check` |
| PO create | `orders`, `requests`, `request` (PR lines become ordered), `approvedRequestLines`, `chain` |
| PO amend | `order`, `orderVersions`, `orders`, `chain` |
| PO cancel | `order`, `orders`, `requests`, `chain` |
| **GRN create** | `grns`, `grn`, `order`, `orders`, `levels`, `levelForItem`, `movements`, `itemMovements`, `availability`, `batches`, `lowStock`, `chain`, `invalidateAccountingViews()` |
| Invoice create | `invoices`, `matchResult`, `order`, `chain` |
| Invoice approve | `invoices`, `invoice`, `matchResult`, `chain`, `invalidateAccountingViews()`, `payables.aging` |
| Payment record | `invoices`, `invoice`, `vendorTransactions`, `chain`, `invalidateAccountingViews()`, `payables.aging` |

The GRN row is the widest here: a receipt touches procurement, inventory, and accounting simultaneously, and forgetting the stock invalidation is the bug that would make the system feel broken.

---

## 6. Client state

- `countSheetStore` — audit count entries with local persistence, because counting happens over hours and possibly with intermittent connectivity. Entries are queued and flushed, with an unsaved-count indicator.
- `poWizardStore` — selected PR lines across PRs, consolidation state, vendor, and pricing.
- `grnDraftStore` — GRN lines with batch and serial entry in progress.
- `stockOperationDraftStore` — issue, transfer, and adjustment line drafts.
- `filterStore` additions for the item master, stock levels grid, movement ledger, vendor list, and each procurement document list.

---

## 7. Forms and validation

| Form | Notable rules |
|---|---|
| Item | Code unique; minimum ≤ reorder ≤ maximum where all are set; a batch-tracked item requires expiry tracking to be considered; standard cost non-negative |
| Location | Name unique within the parent; a location with stock cannot be deactivated, with the on-hand value stated |
| Issue request | At least one line; quantity positive; a quantity above availability warns with the available figure but does not block, since stock may arrive before issue |
| Issue | Issued ≤ approved per line, with the approved figure stated; issued ≤ available, blocking with the available figure; batch selection required for batch-tracked items |
| Transfer | Source ≠ destination; quantity ≤ availability at source, blocking with the figure |
| Adjustment | At least one line with a non-zero difference; reason minimum 10 characters; a decrease beyond on-hand blocked |
| Disposal | Quantity ≤ availability; reason minimum 10 characters |
| Asset | Asset tag unique; acquisition cost positive; useful life ≥ 1; salvage value < acquisition cost |
| Asset assignment | Blocked if already assigned, naming the holder; the return date, when given, must be after the assignment date |
| Audit schedule | At least one location; planned dates valid; overlapping audits for the same location blocked with a link to the existing audit |
| Count sheet | Counted quantity non-negative; a zero count is valid and distinct from an uncounted line, which the grid distinguishes explicitly |
| Audit sign-off | Blocked while any discrepancy line lacks a reason, with the count of unexplained lines stated |
| Vendor | Name and code unique; tax identifier format validated; payment terms non-negative |
| Vendor blacklist | Reason minimum 20 characters |
| Purchase request | At least one line; quantity positive; estimated cost non-negative; justification minimum 20 characters; required-by date in the future; the budget check result displayed |
| PO create | At least one PR line selected; vendor required and not blacklisted; unit price positive; delivery date not before the order date; total budget check shown |
| PO amendment | At least one changed line; reason minimum 20 characters; blocked when any line is fully received |
| PO cancel | Reason minimum 20 characters; blocked when a GRN exists |
| GRN | Received quantity positive; accepted + rejected = received, validated live; a rejection requires a reason; over-receipt beyond tolerance blocked with the tolerance and ordered quantity stated; batch and expiry required for batch-tracked items; expiry date in the future; serial numbers unique and matching the quantity count |
| Vendor invoice | Invoice number unique per vendor; date not in the future; lines reference PO lines; total equals line sum plus tax, validated client-side |
| Invoice approval with mismatch | Override reason minimum 20 characters; permitted role only |

---

## 8. RBAC visibility

| Element | Visible to |
|---|---|
| Item master, categories, locations, units — read | inventory_manager, accountant, principal, super_admin, department heads |
| Item master — write | inventory_manager, super_admin |
| Stock levels and movement ledger | inventory_manager, accountant, principal; department heads for their own locations |
| Issue request create | any employee, for their department |
| Issue request approve | inventory_manager, department head |
| Issue (stock out) | inventory_manager |
| Transfer, adjustment create | inventory_manager |
| Adjustment approve | principal, accountant |
| Disposal | inventory_manager with principal approval |
| Asset register — read | inventory_manager, accountant, principal |
| Asset register — write | inventory_manager |
| Asset disposal | principal, accountant |
| Depreciation run | accountant |
| Audit schedule and sign-off | principal, inventory_manager |
| Count sheet entry | the assigned audit team |
| Vendors — read | inventory_manager, accountant, principal |
| Vendors — write | inventory_manager, accountant |
| Vendor blacklist | principal |
| Purchase request create | any employee, for their department |
| Purchase request department review | department head |
| Purchase request approve | principal |
| Purchase order create, amend, cancel, dispatch | inventory_manager, accountant |
| GRN create | inventory_manager |
| Vendor invoice create | accountant |
| Invoice approve | accountant; mismatch override principal only |
| Payment record | accountant |

The **mismatch override** permission is the one to get right: a three-way match that anyone can override is not a control. The override action is absent, not disabled, for non-principal roles, and a component test asserts this per role.

---

## 9. Accessibility and responsive requirements

| Item | Requirement |
|---|---|
| Stock level grid | A real table with `scope` on both row and column headers; each cell's accessible name includes the item, location, and quantity, since a bare number in a matrix cell is meaningless to a screen reader |
| Movement ledger | Signed quantities stated as received or issued in text; the running balance column clearly headed; the reference link's accessible name names the source document |
| Movement type badges | Text labels always present; never colour alone |
| Live availability | Rendered in a live region so a screen reader user learns the available quantity when they select an item and location |
| Low-stock and expiry indicators | Stated in text ("Below minimum: 4 of 20") in addition to any visual treatment |
| Count sheet grid | Full keyboard navigation with Enter advancing to the next item's count field; an uncounted line is distinguishable from a zero count both visually and in the accessible name; the unsaved-count status in a live region |
| Discrepancy report | A real table; the difference stated with direction in text ("Short by 3") rather than a bare minus sign |
| Three-way match panel | Each line's three quantities separately labelled; the match verdict announced; a mismatch type stated in text; the collapsed and expanded state announced |
| PO line quantities | Ordered, received, and invoiced each labelled in the cell's accessible name |
| Procurement chain | A navigation landmark with an ordered list; each step's status in text; the next-step guidance readable |
| GRN accepted/rejected validation | The live difference announced; the tolerance stated in text when an over-receipt is blocked |
| Budget check indicator | Remaining budget in text; a warning state announced |
| Mobile stock levels | The matrix collapses to a per-item card listing locations, since a matrix is unusable at 360px |
| Mobile count sheet | Single-item-at-a-time entry with a large numeric input, a progress counter, and next and previous actions — this is the only sensible way to count on a phone, and counting on a phone while walking a store room is the realistic scenario |
| Mobile movement ledger | Stacked cards with the reference link retained |
| Mobile GRN | Line-by-line stepper with batch and serial entry, and a numeric keypad input type |
| Mobile three-way match | Per-line cards with the three quantities stacked and the verdict pinned |
| Print | Count sheet and PO have print stylesheets |

---

## 10. Tests owed by this phase

### Component tests

| Target | Scenarios |
|---|---|
| `ItemTable` | Low-stock indicator states the shortfall in text; category and low-stock filters |
| `ItemForm` | Minimum ≤ reorder ≤ maximum enforced; duplicate code error mapped to the field |
| `StockLevelGrid` | Cell accessible names include item, location, and quantity; cells link to the filtered ledger; the mobile layout renders per-item cards |
| `StockMovementLedger` | Running balance arithmetic across a mixed sequence of receipt, issue, transfer, and adjustment rows, asserted against a fixture; direction stated in text; reference links resolve to the right document type |
| `LowStockPanel` | Raise-PR action pre-fills the item and reorder quantity |
| `ExpiryAlertPanel` | Urgency banding correct at the boundaries; disposal action available |
| `IssueRequestForm` | Live availability renders per line and is announced; a quantity above availability warns without blocking |
| `IssuePanel` | Issued above approved blocked with the approved figure stated; issued above available blocked with the available figure; FIFO batch pre-selected; overriding the batch requires a reason |
| `TransferForm` | Same-location blocked; quantity above source availability blocked with the figure |
| `AdjustmentForm` | System quantity shown read-only; difference computed live; a decrease beyond on-hand blocked |
| `AssetAssignmentPanel` | Assigning an assigned asset is blocked and names the current holder |
| `AssetDisposalDialog` | Gain or loss computed against book value and the posting previewed, asserted against a fixture |
| `AssetDepreciationSchedule` | Book value declines correctly across periods; journal links present |
| `CountSheetGrid` | **The system quantity is absent from the DOM during counting** — asserted by querying for the value and expecting no match, since this is a design guarantee and not merely a styling choice; Enter advances to the next count field; an uncounted line differs from a zero count in the accessible name; unsaved status announced |
| `CountSheetGrid` offline | Entries queue when the mutation fails and flush on retry; the queued count is displayed |
| `DiscrepancyReport` | Differences computed correctly including both directions; direction stated in text; sorting by absolute value impact |
| `AuditSignOffPanel` | Blocked while a discrepancy lacks a reason, with the unexplained count stated; the corrective adjustment action appears after sign-off |
| `VendorTable` | Blacklisted vendors are shown with the state in text, not hidden |
| `VendorPerformancePanel` | Aggregate score matches the component ratings; the underlying order count is shown |
| `PurchaseRequestForm` | Budget indicator renders and warns when over budget; low-stock hint appears on a line for a below-minimum item; justification length enforced |
| `PurchaseRequestApprovalBar` | The budget check is re-evaluated for the approver and its result rendered |
| `POCreateWizard` | Multi-PR line selection; identical items consolidate with source PRs listed; a blacklisted vendor is blocked with the reason; totals and the budget check shown |
| `PurchaseOrderDetail` | Ordered, received, and invoiced quantities per line each labelled; the chain widget renders upstream and downstream documents |
| `POAmendmentForm` | Per-line deltas correct; blocked when a line is fully received, with the reason; a reason is required |
| `GRNForm` | Accepted + rejected = received validated live with the difference announced; a rejection requires a reason; over-receipt beyond tolerance blocked with the tolerance and ordered quantity stated; batch and expiry required for tracked items; serial count must match quantity |
| `GRNDetail` | The created stock movements are listed and link into the ledger |
| `ThreeWayMatchPanel` | Matched lines collapsed and mismatched lines expanded by default; each mismatch type stated in text; the verdict announced; the override action is absent for non-principal roles across all nine roles |
| `ProcurementChain` | Linear chain renders in order; a PR feeding two POs lists both; a missing downstream step shows the next action and the responsible role; the current document is identified |

### Hook tests

- `useAvailability` has `staleTime: 0` and is invalidated by issue, transfer, adjustment, return, disposal, and GRN mutations.
- The GRN mutation's invalidation set asserted in full, including the stock level, movement, availability, batch, low-stock, chain, and accounting keys.
- The audit sign-off mutation invalidating stock levels and accounting views.
- `countSheetStore` queue behaviour: persists across a simulated reload, flushes in order, and reports the unsaved count.

### E2E scenarios

| ID | Scenario |
|---|---|
| `INV-E2E-01` | Create an item with a minimum level → receive stock via a GRN → the level grid shows the quantity → drill into the ledger from the cell → the receipt movement is present with the GRN link |
| `INV-E2E-02` | Issue stock below the minimum level → the item appears in the low-stock panel with the shortfall → raise a PR from the panel → the PR is pre-filled |
| `INV-E2E-03` | Issue more than approved → blocked with the approved figure; issue more than available → blocked with the available figure |
| `INV-E2E-04` | FIFO issue consumes the oldest batch; override the batch with a reason and the ledger records it |
| `INV-E2E-05` | Create an adjustment showing the system quantity → approve → the level changes and the ledger and the accounting journal both reflect it |
| `INV-E2E-06` | Full audit cycle: schedule → count with the system quantity never visible → discrepancy report reveals differences → reasons entered → sign-off → corrective adjustment posts and the levels correct (mirrors TDD INV-E2E-02) |
| `INV-E2E-07` | Count on a 360px viewport using the single-item stepper; a dropped connection queues entries and they flush on reconnect |
| `INV-E2E-08` | Register an asset → assign to an employee → attempt a second assignment and it is blocked naming the holder → return → dispose with the gain or loss shown |
| `PRC-E2E-01` | Full chain: raise a PR with the budget indicator → department review → principal approval → consolidate two PRs into one PO → dispatch to the vendor → partial GRN with a quality rejection → stock increases by the accepted quantity only → vendor invoice → three-way match shows the quantity variance from the partial receipt → principal overrides with a reason → AP posts → schedule and record payment (mirrors TDD INV-E2E-01) |
| `PRC-E2E-02` | Amend a PO before receipt → a new version exists and the diff is visible; attempt to amend after full receipt of a line and it is blocked |
| `PRC-E2E-03` | Attempt to create a PO for a blacklisted vendor → blocked with the reason |
| `PRC-E2E-04` | An over-receipt beyond tolerance is blocked with the ordered quantity and tolerance stated |
| `PRC-E2E-05` | A perfectly matched invoice approves without an override; the override affordance is absent for the accountant role |
| `PRC-E2E-06` | From a payment, navigate the chain backwards to the originating PR |
| `RBAC-E2E-05` | Teacher role: can raise an issue request and a PR for their department; cannot see the item master write actions, adjustments, POs, GRNs, or invoices |
| `A11Y-E2E-07` | Keyboard-only: enter a full count sheet and submit a GRN with batch data |

### Accessibility tests

- `jest-axe` on every component in section 4.
- Full-page axe scan on: item list, item detail, stock level grid, movement ledger, low-stock panel, issue request, issue panel, transfer, adjustment, asset list, asset detail, depreciation schedule, audit detail, count sheet, discrepancy report, sign-off, vendor list, vendor detail, PR form, PO wizard, PO detail, GRN form, GRN detail, invoice detail with the match panel.
- Live-region assertions for availability changes, the GRN accepted/rejected difference, count-sheet save status, and the match verdict.

### Visual regression

Baselines for: the stock level grid at desktop and its mobile card fallback; the movement ledger; the low-stock and expiry panels; the count sheet grid (desktop) and the mobile single-item stepper; the discrepancy report; the asset depreciation schedule; the vendor list with a blacklisted row; the PR form with the budget indicator in normal and over-budget states; the PO create wizard consolidation step; the PO detail with partially received lines; the GRN form mid-entry; the three-way match panel in matched and mismatched states; and the procurement chain widget in linear, fan-out, and incomplete states.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] Every stock quantity displayed anywhere drills through to the movements that produced it.
- [ ] The stock level grid is accessible as a matrix and degrades to per-item cards on mobile.
- [ ] Live availability has `staleTime: 0` and is invalidated by every movement mutation.
- [ ] The count sheet never renders the system quantity, asserted by a DOM query test.
- [ ] The count sheet works on a 360px viewport and survives a connectivity loss with a queued-entry indicator.
- [ ] Audit sign-off is blocked until every discrepancy has a reason, with the unexplained count stated.
- [ ] The GRN form enforces accepted + rejected = received live, and over-receipt states the tolerance.
- [ ] A GRN's created stock movements are visible from the GRN detail page.
- [ ] The three-way match panel expands mismatches by default and names each mismatch type in text.
- [ ] The mismatch override action is absent for every role except principal, asserted across all nine roles.
- [ ] The `ProcurementChain` widget renders on all five document types, handles fan-out, and states the next step when the chain is incomplete.
- [ ] The GRN invalidation set covers inventory, procurement, and accounting keys.
- [ ] Zero axe violations on all 24 scanned pages.
