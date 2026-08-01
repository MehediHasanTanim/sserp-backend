# ADR 0004 — PO Commitment Accounting

## Status

Accepted

## Context

Purchase orders create a commercial obligation before goods are received or invoiced. Some ERP systems post a commitment (encumbrance) journal at PO approval. Phase 6 must decide when Accounts Payable and inventory clearing arise.

## Decision

**Commitment accounting is disabled by default.**

- Approving or sending a PO does **not** post a journal.
- Inventory / fixed-asset value is recognized when a GRN is **posted** (debit inventory or fixed assets, credit GRN clearing `2020`).
- Trade payable arises when a vendor invoice is **approved** after three-way matching (debit GRN clearing, credit AP `2010`).
- An organization setting or future feature flag may enable commitment posting; until then services must not invent commitment journals.

## Consequences

- Budget enforcement remains on PR principal approval via `BudgetCheckService`, independent of ledger commitment.
- The GRN clearing account must net to zero for completed POs once invoice approval lands — verified by integration tests.
- Reports that need “open PO commitment” derive it from approved/sent PO remaining quantities × unit price, not from the general ledger.
