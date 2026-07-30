# Phase 4 — Accounts & Finance Rule Traceability

## Posting core (AC-01–AC-13)
| Rule | Test / enforcement |
|------|-------------------|
| AC-01 DR=CR | `accounts.service.spec.ts`; DB CHECK; integrity job |
| AC-02 ≥2 lines | `accounts.service.spec.ts` |
| AC-03 one-sided lines | `accounts.service.spec.ts` |
| AC-04 group/inactive | `accounts.service.spec.ts` |
| AC-05 closed period | `accounts.service.spec.ts` + FiscalPeriodService |
| AC-06–07 approval/reversal | `journal.service.ts` |
| AC-08 system skip approval | `AccountsService.postFromRequest` |
| AC-09 idempotency | `accounts.service.spec.ts` |
| AC-10 posting_rules | `accounts.service.spec.ts` + `PostingRuleService` |
| AC-11 cost center | `accounts.service.spec.ts` |
| AC-12 in-tx | `AccountsService` requires `tx`; adapter prefers caller tx |

## AR / Budget / Bank / Finance
| Rule | Implementation |
|------|----------------|
| AR-01/05 subledger | `ReceivableService` + `SchoolTherapyArListener` |
| AR-03 aging buckets | `ReceivableService.aging` |
| BU-01–06 | `BudgetCheckService` |
| BK-03/04 recon | `ReconciliationService` |
| FI-01/06 shares & rounding | `ShareholderService` / `ProfitAppropriationService.disburse` |
| OB-01–05 outbox | `AccountsOpsJob` outbox replay; `PortsModule` → `AccountsLedgerAdapter` |
