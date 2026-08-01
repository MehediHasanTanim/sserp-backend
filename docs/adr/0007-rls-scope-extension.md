# ADR 0007 — RLS Scope Extension (Phase 9)

## Status

Accepted

## Context

TDD 12.2 requires Row-Level Security on `student_medical_records`, `session_notes`, and `payroll_slips`. The same sensitivity applies to `patient_medical_history` and `gratuity_payments`.

## Decision

1. Enable RLS on five tables: `student_medical_records`, `session_notes`, `payroll_slips`, `patient_medical_history`, `gratuity_payments`.
2. Application connects as `sserp_app` **without** `BYPASSRLS` (H-01).
3. Every request sets `SET LOCAL app.current_user_id`, `app.current_roles`, `app.scoped_student_ids` inside the transaction (H-02). Missing context → fail-closed (zero rows).
4. Service-layer scope filters remain the primary control; RLS is defence-in-depth.

## Consequences

- Integration tests assert per-role visibility and fail-closed behaviour.
- Superuser/migration role retains BYPASSRLS for admin tasks only.
