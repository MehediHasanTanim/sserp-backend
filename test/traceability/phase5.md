# Phase 5 — HR Payroll & Gratuity Rule Traceability

## Payroll (PR-01–PR-17)
| Rule | Test / enforcement |
|------|-------------------|
| PR-01 one active structure | `SalaryStructureService.createStructure` / `approve` |
| PR-02 structure approved | `STRUCTURE_NOT_APPROVED` in payroll calc path |
| PR-03–05 gross/net/LOP | `payroll-calculation.service.spec.ts` |
| PR-06 unique run | `payroll-run.service.spec.ts` + `PayrollRunService.createRun` → `PAYROLL_RUN_EXISTS` |
| PR-07 async idempotent calc | `payroll-idempotency.integration.spec.ts`; `performCalculation` replaces slips |
| PR-08 locked immutability | `payroll-immutability.integration.spec.ts`; `requireMutable` / `PAYROLL_LOCKED` |
| PR-09 lock journal | `payroll-run.integration.spec.ts` — one posted journal, DR=CR |
| PR-10 approval before lock | `payroll-run.service.spec.ts` → `RUN_NOT_APPROVED` |
| PR-11 mid-month join/exit | `payroll-calculation.service.spec.ts` daysInPeriod cases |
| PR-12 encashment/bonus/loan pull | `encashment-payroll.integration.spec.ts`, `loan-payroll.integration.spec.ts` |
| PR-13 tax slabs | `StatutoryDeductionService` pure-math in `payroll-calculation.service.spec.ts` |
| PR-15 bank file | `payroll-run.service.spec.ts` → `PAYROLL_NOT_LOCKED` |
| PR-16 negative net | `payroll-calculation.service.spec.ts` → `NEGATIVE_NET_PAY` |

## Gratuity (GR-01–GR-15)
| Rule | Test / enforcement |
|------|-------------------|
| GR-01 one active policy | `GratuityPolicyService.activate` |
| GR-02–04 formula | `gratuity-calculation.service.spec.ts` |
| GR-06–07 provision delta / idempotent | `gratuity-provision.integration.spec.ts` |
| GR-08–09 ledger + journal | provision tx + `gratuity_ledger`; DR=CR asserted |
| GR-10–13 settlement | `gratuity-settlement.integration.spec.ts` / unit `EXIT_RECORD_MISSING` / `ALREADY_SETTLED` |

## Encashment (EN-01–EN-08)
| Rule | Test / enforcement |
|------|-------------------|
| EN-02 eligible days (6 combos) | `encashment.service.spec.ts` |
| EN-04 two-level approval | `encashment-payroll.integration.spec.ts` |
| EN-05 deduct + adjustment | principal approval tx |
| EN-06 process on locked run | `PAYROLL_NOT_LOCKED` |
| EN-07 exit automatic | `eos-settlement.integration.spec.ts` |

## Soft HR / Benefits / Recruitment
| Rule | Test |
|------|------|
| PF KPI weights | `soft-hr.smoke.spec.ts`, `appraisal-cycle.integration.spec.ts` |
| RC stage / convert | `soft-hr.smoke.spec.ts`, `recruitment-to-employee.integration.spec.ts` |
| TR capacity | `soft-hr.smoke.spec.ts` |
| BN loan schedule | `soft-hr.smoke.spec.ts`, `loan-payroll.integration.spec.ts` |

## Exit criteria proofs
| Criterion | Proof |
|-----------|-------|
| Pure calc Semgrep | `.semgrep/phase5-pure-calc.yml` — CI `stage2-unit` runs `semgrep --config .semgrep` |
| Payslip PDF non-empty | `src/modules/files/pdf/payslip-pdf.spec.ts` (gross/net in buffer) |
| Ledger integrity after payroll | `payroll-run.integration.spec.ts` + `AccountsOpsJob.ledgerIntegrityCheck` |
| EOS arithmetic | `eos-settlement.integration.spec.ts` |
| RBAC | `hr-payroll-rbac.integration.spec.ts` |

## Phase 9 checklist note (TODO-GOLIVE)
Statutory income-tax slabs and PF ceiling in `prisma/seed/phase5.seed.ts` are marked **`TODO-GOLIVE`**. Before production go-live (Phase 9 hardening), replace placeholder slabs/rates with jurisdiction-accurate statutory values and re-run payroll/tax certificate suites. Track under Phase 9 go-live checklist; do not treat seed placeholders as production configuration.

## Jobs & events
| Item | Location |
|------|----------|
| payroll queue | `PayrollCalculationProcessor` |
| pdf `render-payslip` | `PdfProcessor` + enqueue on payroll lock |
| monthly provision | `GratuityMonthlyProvisionJob` |
| exit → encashment | `ExitSettlementListener` |
| accounts verify | `HrPostingListener` |
