# Phase 4 Outbox Reconciliation Report

Generated as part of Phase 4 cutover (OB-04 / exit criteria).

## Cutover status

- `LedgerPort` is bound to `AccountsLedgerAdapter` in `PortsModule`.
- Historical `pending_ledger_postings` are drained by `AccountsOpsJob` outbox replay
  (idempotent via `idempotency_reference` = `{referenceType}:{referenceId}:{variant}`).
- Outbox table retained read-only for audit; new postings go straight to journals.

## Expected reconciliation procedure

1. Seed Phase 4 CoA + `posting_rules` (`prisma/seed/phase4.seed.ts`).
2. Run `AccountsOpsJob` outbox replay (or hourly cron during migration window).
3. Compare per `reference_type`:

```sql
SELECT reference_type,
       SUM(amount) FILTER (WHERE status = 'posted') AS outbox_total
FROM pending_ledger_postings
GROUP BY 1;

SELECT reference_type,
       SUM(total_debit) AS journal_debit
FROM journal_entries
WHERE entry_type = 'system' AND status = 'posted'
GROUP BY 1;
```

4. Assert outbox posted totals match journal totals per reference type; zero `failed` rows.

## Coverage

`posting_rules` seeded for Phase 1–3 events plus Phase 5/6 stubs (`payroll`, `gratuity_provision`, `vendor_invoice`).
