# Phase 1 rule → test traceability

Maps every invariant in `docs/plan/backend/02-phase1-hr-school-core.md` §6 to an automated test.

| Rule | Test(s) |
|---|---|
| S-01 Enrollment creates fee + pending status | `student-enrollment.integration.spec.ts`; `admission-fee.service.spec.ts` |
| S-02 Pending blocks mapping | `admission-gate.integration.spec.ts`; `teacher-mapping.service.spec.ts` |
| S-03 Full payment activates | `student-enrollment.integration.spec.ts`; `admission-fee.service.spec.ts` |
| S-04 Partial payment rejected | `admission-fee.service.spec.ts` |
| S-05 Double pay conflict | `admission-fee.service.spec.ts` |
| S-06 Waiver principal + reason | `admission-fee.service.spec.ts` |
| S-07 Status via StudentStatusService only | Semgrep `no-direct-student-status-write`; `student-status.service.spec.ts` |
| S-08 Transition matrix | `student-status.service.spec.ts` |
| S-09 Re-enrollment | `student-status.service.spec.ts` / StudentService unit coverage |
| M-01–M-02 Shift cap | `teacher-mapping.service.spec.ts`; `shift-cap.integration.spec.ts` |
| M-03 Teacher not in shift | `teacher-mapping.service.spec.ts` |
| M-04 Shift mismatch | `teacher-mapping.service.spec.ts` |
| M-05 Student not active / fee pending | `admission-gate.integration.spec.ts` |
| M-06 One active mapping per student | `teacher-mapping.service.spec.ts` |
| M-07 Concurrent FOR UPDATE | `shift-cap.integration.spec.ts` |
| M-08 Mapping exists on shift remove | `teacher-mapping.service.spec.ts` (shift update path) |
| B-01–B-03 Absence/leave → pending substitute | `substitute.service.spec.ts` |
| B-04 Substitute unavailable | `substitute.service.spec.ts` |
| B-05 No shift cap for substitutes | `substitute.service.spec.ts` |
| B-06 Auto-revert | `substitute.service.spec.ts` |
| B-07 Cancel on leave cancel | `substitute.service.spec.ts` |
| L-01–L-08 Leave rules | `leave.integration.spec.ts`; leave unit services |
| A-01 Holiday rejected | `school-attendance.service.spec.ts` |
| A-02 Future date | `school-attendance.service.spec.ts` |
| A-03 Enrollment range | `school-attendance.service.spec.ts` |
| A-04 Mapped/substitute/coordinator only | `school-attendance.service.spec.ts` |
| A-05 Freeze / amendment | `school-attendance.service.spec.ts` |
| A-06 Percentage maths | `school-attendance.service.spec.ts`; `working-days.service.spec.ts` |
| A-07 Bulk idempotent | `school-attendance.service.spec.ts` |
| HR boundary | `hr-boundary.integration.spec.ts`; Semgrep `no-prisma-employee-outside-hr` |

## Fixture notes (A-06)

Monthly attendance percentage fixture (unit test): 22 calendar days, 2 holidays, 1 approved leave day, 1 half-day, 2 absences → working days and present-equivalent asserted against hand-computed expected value in `school-attendance.service.spec.ts`.
