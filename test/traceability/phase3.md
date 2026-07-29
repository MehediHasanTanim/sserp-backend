# Phase 3 — Therapy Module Rule Traceability

## Conflict Engine (C-01–C-09)
| Rule | Description | Test |
|------|-------------|------|
| C-01 | Therapist double-booking detected before DB | `conflict-detection.service.spec.ts` — "should detect therapist double-booking" |
| C-02 | Patient double-booking detected | `conflict-detection.service.spec.ts` — "should detect patient double-booking" |
| C-05 | Approved HR leave is blocking | `conflict-detection.service.spec.ts` — "should detect leave conflict" |
| C-06 | Adjacent sessions are NOT conflicts (half-open intervals) | `conflict-detection.service.spec.ts` — "adjacent sessions should not conflict" |

## Therapist Rules (T-01–T-05)
| Rule | Description | Test |
|------|-------------|------|
| T-01 | Create therapist from active HR employee | `therapist.service.spec.ts` — "should create a therapist for an active employee" |
| T-02 | Reject therapist creation for inactive employee | `therapist.service.spec.ts` — "should reject creating therapist for inactive employee" |
| T-03 | Reject duplicate therapist profile | `therapist.service.spec.ts` — "should reject duplicate therapist profile" |
| T-04 | supportsGroup=true derived for ot/speech/music/dance | `therapist.service.spec.ts` — "should derive supportsGroup=true for ot" |
| T-05 | supportsGroup=false derived for aba/assessment | `therapist.service.spec.ts` — "should derive supportsGroup=false for aba" |

## Patient Rules (PA-01–PA-06)
| Rule | Description | Test |
|------|-------------|------|
| PA-01 | Patient from active student only | `patient.service.ts` — validates student status = active |
| PA-04 | Student-linked patients read name/DOB/gender from SchoolStudentReadService | `patient.service.ts` — stores null columns; hydrates via findByIdWithStudentInfo |

## Recurrence Rules (R-01–R-08)
| Rule | Description | Test |
|------|-------------|------|
| R-01 | Weekly pattern generates only on correct day | `recurrence.service.spec.ts` — "weekly pattern should only generate dates on the correct day" |
| R-02 | Biweekly generates every 2 weeks | `recurrence.service.spec.ts` — "biweekly pattern should generate every 2 weeks" |
| R-03 | Monthly generates on correct day of month | `recurrence.service.spec.ts` — "monthly pattern should generate on correct day of month" |
| R-04 | DST boundary: dates stay on correct wall-clock day | `recurrence.service.spec.ts` — "DST boundary" |
| R-05 | Skip conflicts in non-strict mode | `recurrence.service.spec.ts` — "should skip conflicting dates when strict=false" |
| R-06 | Strict mode throws on first conflict | `recurrence.service.spec.ts` — "strict mode should throw on first conflict" |
| R-07 | Series cap = 500 | `recurrence.service.ts` — MAX_SERIES_SESSIONS constant |

## Group Rules (G-01–G-11)
| Rule | Description | Test |
|------|-------------|------|
| G-01 | Group enroll under lock for capacity | `group.service.ts` — $transaction + count |
| G-02 | Waitlist when at capacity | `group.service.ts` — enroll creates waitlisted membership |
| G-03 | Promote waitlisted on exit | `group.service.ts` — exitMember promotes next |
| G-04 | Cannot enroll if already active/waitlisted | `group.service.ts` — ALREADY_ENROLLED error |
| G-05 | Group supports group sessions for therapy type | `group.service.ts` — checks supportsGroup specialization |

## Billing Rules (BI-01–BI-11)
| Rule | Description | Test |
|------|-------------|------|
| BI-01 | Fee resolution: group-specific > mode+type+duration > mode+type | `therapy-billing.service.ts` — resolveFee method |
| BI-03 | Per-session invoice on complete | `session-completed.listener.ts` — auto-generates on SESSION_COMPLETED |
| BI-05 | Monthly consolidated covers multiple sessions | `therapy-billing.service.ts` — generateMonthlyConsolidated |
| BI-07 | Group discount scoped per-patient, never group-wide | `therapy-billing.service.ts` — applyDiscount scopes to (patientId, invoiceId) |
| BI-09 | Overpayment rejected | `therapy-billing.service.ts` — OVERPAYMENT error on recordPayment |

## Treatment Plan Rules (TP-01–TP-04)
| Rule | Description | Test |
|------|-------------|------|
| TP-01 | One active plan per (patient, therapy_type) | DB partial unique index + ACTIVE_TREATMENT_PLAN_EXISTS error |
| TP-02 | Plan activation archives previous active plan | `treatment-plan.service.ts` — activate() |
| TP-03 | Share with guardian only when active | `treatment-plan.service.ts` — shareWithGuardian validates status |
| TP-04 | Goal progress links session to goal | `treatment-plan.service.ts` — recordGoalProgress |

## Portal Integration
| Rule | Description | Implementation |
|------|-------------|----------------|
| Portal therapy-schedule | Returns scheduled sessions for patient linked to student | `portal.controller.ts` — GET /portal/children/:studentId/therapy-schedule |
| Scope enforcement | Only shows sessions for guardian's linked students | PortalScopeGuard + patient lookup by studentId |
