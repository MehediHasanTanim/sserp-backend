# Phase 6 — Inventory & Procurement Rule Traceability

## Stock (ST-01–ST-11)
| Rule | Test / enforcement |
|------|-------------------|
| ST-01 append-only movements | Migration REVOKE on `stock_movements`; `stock-append-only.integration.spec.ts` |
| ST-02/03 level lock + no negative | `stock-movement.service.spec.ts` + `stock-concurrency.integration.spec.ts` |
| ST-05 FIFO | `stock-valuation.service.spec.ts` |
| ST-06 WAVG | `stock-valuation.service.spec.ts` (incl. 50-step sequence) |
| ST-07 transfer conservation | `stock-movement.service.spec.ts` |
| ST-08 expired batches | `stock-valuation.service.spec.ts` / BATCH_EXPIRED |
| ST-09/10 low-stock once + auto-PR | `low-stock-auto-pr.integration.spec.ts` |

## Assets (AS-01–AS-06)
| Rule | Test |
|------|------|
| AS-03/04 depreciation | `depreciation.service.spec.ts`, `depreciation-run.integration.spec.ts` |
| AS-05 disposal journals | `asset-disposal.integration.spec.ts` |

## Audit (IA-01–IA-07)
| Rule | Test |
|------|------|
| Freeze / reconcile / sign-off | `inventory-audit.service.spec.ts`, `inventory-audit.integration.spec.ts` |

## PR / PO / GRN / TW
| Rule | Test |
|------|------|
| PR-01–PR-09 workflow | `pr-approval.service.spec.ts` + `pr-po-grn-chain` / `pr-budget-rejection` / `procurement-rbac` |
| PO-01–PO-08 | `purchase-order.service.spec.ts` + chain integration |
| GR-01–GR-09 | `grn.service.spec.ts` + `grn-atomicity` / `grn-clearing` / chain |
| TW-01–TW-08 | `three-way-match.service.spec.ts` + `three-way-match.integration.spec.ts` / `grn-clearing` |

## Integration suites (W5)
| Suite | Focus |
|-------|--------|
| `pr-po-grn-chain.integration.spec.ts` | Full PR → PO → GRN → stock + journal |
| `pr-budget-rejection.integration.spec.ts` | Budget block + rejection, no PO |
| `grn-atomicity.integration.spec.ts` | Rollback on asset failure |
| `grn-clearing.integration.spec.ts` | Clearing account nets zero |
| `three-way-match.integration.spec.ts` | Variance block + principal override |
| `inventory-audit.integration.spec.ts` | Count → adjust → sign-off |
| `stock-concurrency.integration.spec.ts` | 6/4 parallel issue split + 20-run exit |
| `low-stock-auto-pr.integration.spec.ts` | One alert + one draft PR |
| `depreciation-run.integration.spec.ts` | 12 × 20 assets, idempotent repeat |
| `asset-disposal.integration.spec.ts` | Gain/loss balanced journals |
| `procurement-rbac.integration.spec.ts` | Teacher create PR, deny approve/PO/GRN |
| `stock-append-only.integration.spec.ts` | ST-01 DB role REVOKE proof |

## Unit specs (W5)
| Service | Spec |
|---------|------|
| StockMovementService | `stock-movement.service.spec.ts` |
| StockValuationService | `stock-valuation.service.spec.ts` |
| DepreciationService | `depreciation.service.spec.ts` |
| InventoryAuditService | `inventory-audit.service.spec.ts` |
| PrApprovalService | `pr-approval.service.spec.ts` |
| PurchaseOrderService | `purchase-order.service.spec.ts` |
| GrnService | `grn.service.spec.ts` |
| ThreeWayMatchService | `three-way-match.service.spec.ts` |

## Exit criteria
| Criterion | Proof |
|-----------|-------|
| Append-only movements (ST-01) | `stock-append-only.integration.spec.ts` — UPDATE/DELETE denied for `sserp_app` |
| Stock concurrency (20 runs) | `stock-concurrency.integration.spec.ts` — describe `exit criteria — 20 consecutive runs` |
| WAVG 50-movement drift | `stock-valuation.service.spec.ts` — `50-step WAVG sequence` |
| Audit reconcile loop | `inventory-audit.integration.spec.ts` — adjust to physical, sign-off |
| GRN clearing nets zero | `grn-clearing.integration.spec.ts` |
| TW blocks over-invoice | `three-way-match.integration.spec.ts` + unit spec |
| Principal-only PR approval | `procurement-rbac.integration.spec.ts` + `pr-approval.service.spec.ts` |
| Ledger integrity | `AccountsOpsJob.ledgerIntegrityCheck` in chain / clearing / depreciation / disposal suites |
| Pure calc Semgrep | `.semgrep/phase6-pure-calc.yml` (CI `semgrep --config .semgrep`) |
| ADR PO commitment off | `docs/adr/0004-po-commitment-accounting.md` |
| Mutation ≥75% | `stryker.config.js` — seven Phase 6 services |
| k6 | `k6/scripts/stock-level-load.js`, `grn-post.js` |
