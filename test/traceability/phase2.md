# Phase 2 rule → test traceability

Maps invariants in `docs/plan/backend/03-phase2-school-advanced.md` §6 to automated tests.

| Rule | Test(s) |
|---|---|
| I-01–I-11 IEP lifecycle | `iep.service.spec.ts` |
| P-01–P-07 Progress workflow | `progress-report.service.spec.ts` |
| F-01–F-12 Fees | `fee-invoice.service.spec.ts`, `fee-payment.service.spec.ts` |
| O-01–O-10 Activities | `activity.service.spec.ts` |
| O-08 Attendance isolation | `activity.service.spec.ts` (documented) + integration planned |
| SL-01–SL-07 Student leave | `student-leave.service.spec.ts` |
| PT-01–PT-06 Portal scope | `portal-scope.service.spec.ts` |
