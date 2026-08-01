# Phase 9 traceability

| Rule | Test |
|---|---|
| H-01 no BYPASSRLS | `rls.integration.spec.ts` |
| H-02 RLS session context / fail-closed | `rls.integration.spec.ts` + `RlsContextService` |
| H-03 encrypted fields scrubbed | `sensitive-fields.serializer.ts` + encryption suites |
| H-04 key rotation re-wrap | `FieldEncryptionService.rotatePurpose` |
| H-05 idle timeout | `session` contract in `rls.integration.spec.ts` / `IdleTimeoutGuard` |
| H-06 audit hash chain | `audit-chain.integration.spec.ts` |
| H-07 offline idempotency/conflicts | `offline-sync.integration.spec.ts` |
| H-08 payment webhook only | `payment-webhook.integration.spec.ts` |
| H-09 import DTO validation | `encryption.integration.spec.ts` (data import) |
| H-10 opening balance DR=CR | `encryption.integration.spec.ts` |

## Artefacts

- ADRs 0007 / 0008
- Runbooks under `docs/runbooks/`
- Prod compose + Nginx `docker/docker-compose.prod.yml`
- Grafana dashboard JSON
- k6 `therapy-calendar-load.js` + `docs/reports/phase9-performance.md`
- Semgrep / gitleaks / Trivy / ZAP CI stages
- Stryker mutate list includes hardening services
