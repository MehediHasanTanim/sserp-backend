# ADR 0003 — HR Leave is Blocking for Therapy Sessions

**Status:** Accepted  
**Date:** 2026-07-30  
**Deciders:** Engineering, Operations

## Context

When a therapist's HR leave is approved, they may have already-scheduled therapy sessions that overlap with the leave period.

## Decision

Approved HR leave is **blocking** — `ConflictDetectionService.checkWithLeave()` returns a `leave_conflict` entry in `blocking[]`.

Coordinators may override this via `force: true` on the schedule/reschedule call, which bypasses the service-level check. This override is recorded via the `@Audit` interceptor.

The `HrLeaveConflictListener` fires on `hr.leave.approved`, scans for overlapping sessions, and emits `HR_LEAVE_CONFLICT_FLAGGED` for each — notifying coordinators to take action.

## Consequences

- Coordinators are always informed of leave-vs-session conflicts.
- Sessions are **not auto-cancelled** on leave approval; the coordinator must explicitly cancel or force-reschedule.
- The `force: true` audit trail ensures accountability.
- This approach avoids surprise cancellations to patients while maintaining visibility.
