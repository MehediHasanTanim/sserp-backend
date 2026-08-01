import { EventNames } from '../../../shared/events/event-names';
import { ResolvedRecipient } from '../services/recipient-resolver.service';

export interface NotificationMapping {
  event: string;
  typeCode: string;
  recipients: (
    payload: Record<string, unknown>,
    ctx: NotificationMappingContext,
  ) => Promise<ResolvedRecipient[]>;
  variables: (payload: Record<string, unknown>) => Record<string, unknown>;
  groupKey?: (payload: Record<string, unknown>) => string | undefined;
}

export interface NotificationMappingContext {
  resolveGuardians: (
    studentId: string,
    critical?: boolean,
  ) => Promise<ResolvedRecipient[]>;
  resolveRoles: (roles: string[]) => Promise<ResolvedRecipient[]>;
  resolveUser: (userId: string) => Promise<ResolvedRecipient | null>;
  resolvePrRequester: (prId: string) => Promise<ResolvedRecipient | null>;
  resolveGroupGuardians: (groupId: string) => Promise<ResolvedRecipient[]>;
}

/** Every notifiable domain event must appear here (plan §7). */
export const NOTIFIABLE_EVENTS: string[] = [
  EventNames.STUDENT_ACTIVATED,
  EventNames.STUDENT_ATTENDANCE_UNAUTHORIZED_ABSENCE,
  EventNames.FEE_OVERDUE,
  EventNames.ADMISSION_FEE_PENDING,
  EventNames.STUDENT_LEAVE_APPROVED,
  EventNames.STUDENT_LEAVE_REJECTED,
  EventNames.STUDENT_LEAVE_SUBMITTED,
  EventNames.IEP_PUBLISHED,
  EventNames.IEP_REVISED,
  EventNames.IEP_REVIEW_DUE,
  EventNames.PROGRESS_REPORT_PUBLISHED,
  EventNames.ACTIVITY_OPTIN_INVITED,
  EventNames.ACTIVITY_CANCELLED,
  EventNames.ACTIVITY_FEE_UNPAID,
  EventNames.SESSION_CANCELLED,
  EventNames.SUBSTITUTE_UNASSIGNED,
  EventNames.HR_LEAVE_APPROVED,
  EventNames.HR_LEAVE_REJECTED,
  EventNames.HR_ATTENDANCE_ANOMALY,
  EventNames.PAYROLL_RUN_COMPLETED,
  EventNames.GRATUITY_ELIGIBILITY_REACHED,
  EventNames.ENCASHMENT_APPROVED,
  EventNames.LICENSE_EXPIRING,
  EventNames.EMPLOYEE_CONTRACT_EXPIRING,
  EventNames.INVENTORY_STOCK_LOW,
  EventNames.PROCUREMENT_PR_STATUS_CHANGED,
  EventNames.REPORT_EXPORT_READY,
];

export const NOTIFICATION_MAP: NotificationMapping[] = [
  {
    event: EventNames.STUDENT_ACTIVATED,
    typeCode: 'student.activated',
    recipients: (p, ctx) => ctx.resolveGuardians(String(p.studentId)),
    variables: (p) => ({
      title: 'Student activated',
      body: `Student account is now active.`,
      studentId: p.studentId,
    }),
  },
  {
    event: EventNames.STUDENT_ATTENDANCE_UNAUTHORIZED_ABSENCE,
    typeCode: 'student.absent',
    recipients: (p, ctx) => ctx.resolveGuardians(String(p.studentId), true),
    variables: (p) => ({
      title: 'Unauthorized absence',
      body: `Your ward was marked absent on ${p.date ?? 'today'}.`,
      studentId: p.studentId,
      date: p.date,
    }),
    groupKey: (p) => `absence:${p.studentId}:${p.date}`,
  },
  {
    event: EventNames.FEE_OVERDUE,
    typeCode: 'fee.overdue',
    recipients: (p, ctx) => ctx.resolveGuardians(String(p.studentId)),
    variables: (p) => ({
      title: 'Fee overdue',
      body: `A fee invoice is overdue.`,
      studentId: p.studentId,
    }),
  },
  {
    event: EventNames.ADMISSION_FEE_PENDING,
    typeCode: 'admission_fee.pending',
    recipients: (p, ctx) => ctx.resolveGuardians(String(p.studentId)),
    variables: (p) => ({
      title: 'Admission fee pending',
      body: 'Admission fee payment is still outstanding.',
      studentId: p.studentId,
      admissionFeeId: p.admissionFeeId,
    }),
    groupKey: (p) =>
      `admission_fee:${p.admissionFeeId ?? p.studentId}:${p.offsetDays ?? ''}`,
  },
  {
    event: EventNames.STUDENT_LEAVE_APPROVED,
    typeCode: 'student_leave.decided',
    recipients: (p, ctx) => ctx.resolveGuardians(String(p.studentId)),
    variables: (p) => ({
      title: 'Leave approved',
      body: `Student leave request was approved.`,
      decision: 'approved',
    }),
  },
  {
    event: EventNames.STUDENT_LEAVE_REJECTED,
    typeCode: 'student_leave.decided',
    recipients: (p, ctx) => ctx.resolveGuardians(String(p.studentId)),
    variables: (p) => ({
      title: 'Leave rejected',
      body: `Student leave request was rejected.`,
      decision: 'rejected',
    }),
  },
  {
    event: EventNames.STUDENT_LEAVE_SUBMITTED,
    typeCode: 'student_leave.submitted',
    recipients: async (p, ctx) =>
      ctx.resolveRoles(['coordinator', 'principal']),
    variables: () => ({
      title: 'Leave submitted',
      body: 'A new student leave request awaits review.',
    }),
  },
  {
    event: EventNames.IEP_PUBLISHED,
    typeCode: 'iep.updated',
    recipients: (p, ctx) => ctx.resolveGuardians(String(p.studentId)),
    variables: () => ({
      title: 'IEP published',
      body: 'An IEP has been published.',
    }),
  },
  {
    event: EventNames.IEP_REVISED,
    typeCode: 'iep.updated',
    recipients: (p, ctx) => ctx.resolveGuardians(String(p.studentId)),
    variables: () => ({
      title: 'IEP revised',
      body: 'An IEP has been revised.',
    }),
  },
  {
    event: EventNames.IEP_REVIEW_DUE,
    typeCode: 'iep.review_due',
    recipients: async (p, ctx) => {
      const guardians = p.studentId
        ? await ctx.resolveGuardians(String(p.studentId))
        : [];
      const staff = await ctx.resolveRoles(['coordinator', 'principal']);
      return [...guardians, ...staff];
    },
    variables: (p) => ({
      title: 'IEP review due',
      body: `IEP review is due on ${p.nextReviewDate ?? 'soon'}.`,
      studentId: p.studentId,
      iepId: p.iepId,
    }),
    groupKey: (p) => `iep_review:${p.iepId}:${p.offsetDays ?? ''}`,
  },
  {
    event: EventNames.PROGRESS_REPORT_PUBLISHED,
    typeCode: 'progress_report.available',
    recipients: (p, ctx) => ctx.resolveGuardians(String(p.studentId)),
    variables: () => ({
      title: 'Progress report available',
      body: 'A progress report is now available.',
    }),
  },
  {
    event: EventNames.ACTIVITY_OPTIN_INVITED,
    typeCode: 'activity.optin_invite',
    recipients: (p, ctx) => ctx.resolveGuardians(String(p.studentId)),
    variables: (p) => ({
      title: 'Activity invitation',
      body: `You are invited to opt in to ${p.activityName ?? 'an activity'}.`,
    }),
  },
  {
    event: EventNames.ACTIVITY_CANCELLED,
    typeCode: 'activity.cancelled',
    recipients: (p, ctx) => ctx.resolveGuardians(String(p.studentId)),
    variables: (p) => ({
      title: 'Activity cancelled',
      body: `Activity ${p.activityName ?? ''} was cancelled.`,
    }),
  },
  {
    event: EventNames.ACTIVITY_FEE_UNPAID,
    typeCode: 'activity.fee_unpaid',
    recipients: (p, ctx) => ctx.resolveGuardians(String(p.studentId)),
    variables: (p) => ({
      title: 'Activity fee unpaid',
      body: `Activity fee remains unpaid before ${p.activityDate ?? 'the activity'}.`,
      studentId: p.studentId,
      enrollmentId: p.enrollmentId,
      activityId: p.activityId,
    }),
    groupKey: (p) =>
      `activity_fee:${p.enrollmentId}:${p.activityDate ?? ''}`,
  },
  {
    event: EventNames.SESSION_CANCELLED,
    typeCode: 'therapy_session.cancelled',
    recipients: async (p, ctx) => {
      if (p.groupId) return ctx.resolveGroupGuardians(String(p.groupId));
      if (p.studentId) return ctx.resolveGuardians(String(p.studentId));
      if (p.patientId) {
        const patient = await ctx.resolveUser(String(p.requestedBy ?? ''));
        return patient ? [patient] : [];
      }
      return [];
    },
    variables: (p) => ({
      title: 'Session cancelled',
      body: 'A therapy session was cancelled.',
      sessionId: p.sessionId,
    }),
  },
  {
    event: EventNames.SUBSTITUTE_UNASSIGNED,
    typeCode: 'substitute.unassigned',
    recipients: async (_p, ctx) =>
      ctx.resolveRoles(['coordinator', 'principal']),
    variables: (p) => ({
      title: 'Substitute unassigned',
      body: `Substitute assignment removed for ${p.date ?? 'a session'}.`,
    }),
    groupKey: (p) => `substitute:${p.date}:${p.shiftId}`,
  },
  {
    event: EventNames.HR_LEAVE_APPROVED,
    typeCode: 'hr.leave.decided',
    recipients: async (p, ctx) => {
      const r = await ctx.resolveUser(String(p.employeeUserId ?? p.userId));
      return r ? [r] : [];
    },
    variables: () => ({
      title: 'Leave approved',
      body: 'Your leave request was approved.',
      decision: 'approved',
    }),
  },
  {
    event: EventNames.HR_LEAVE_REJECTED,
    typeCode: 'hr.leave.decided',
    recipients: async (p, ctx) => {
      const r = await ctx.resolveUser(String(p.employeeUserId ?? p.userId));
      return r ? [r] : [];
    },
    variables: () => ({
      title: 'Leave rejected',
      body: 'Your leave request was rejected.',
      decision: 'rejected',
    }),
  },
  {
    event: EventNames.HR_ATTENDANCE_ANOMALY,
    typeCode: 'hr.attendance.anomaly',
    recipients: async (_p, ctx) => ctx.resolveRoles(['hr_officer']),
    variables: (p) => ({
      title: 'Attendance anomaly',
      body: `Employee ${p.employeeCode ?? p.employeeId ?? ''} has a late streak.`,
      employeeId: p.employeeId,
      lateStreakDays: p.lateStreakDays,
    }),
    groupKey: (p) => `hr_anomaly:${p.employeeId}:${p.asOfDate ?? ''}`,
  },
  {
    event: EventNames.PAYROLL_RUN_COMPLETED,
    typeCode: 'payroll.processed',
    recipients: async (p, ctx) => {
      const ids = (p.employeeUserIds as string[] | undefined) ?? [];
      const out: ResolvedRecipient[] = [];
      for (const id of ids) {
        const r = await ctx.resolveUser(id);
        if (r) out.push(r);
      }
      return out;
    },
    variables: (p) => ({
      title: 'Payroll processed',
      body: `Payroll run ${p.payrollRunId ?? ''} completed.`,
    }),
  },
  {
    event: EventNames.GRATUITY_ELIGIBILITY_REACHED,
    typeCode: 'gratuity.eligibility',
    recipients: async (p, ctx) => {
      const hr = await ctx.resolveRoles(['hr_officer']);
      const user = p.userId ? await ctx.resolveUser(String(p.userId)) : null;
      return user ? [...hr, user] : hr;
    },
    variables: () => ({
      title: 'Gratuity eligibility',
      body: 'An employee has reached gratuity eligibility.',
    }),
  },
  {
    event: EventNames.ENCASHMENT_APPROVED,
    typeCode: 'encashment.decided',
    recipients: async (p, ctx) => {
      const r = await ctx.resolveUser(String(p.userId ?? p.employeeUserId));
      return r ? [r] : [];
    },
    variables: () => ({
      title: 'Encashment approved',
      body: 'Your encashment request was approved.',
      decision: 'approved',
    }),
  },
  {
    event: EventNames.LICENSE_EXPIRING,
    typeCode: 'therapist.license.expiring',
    recipients: async (_p, ctx) =>
      ctx.resolveRoles(['coordinator', 'principal']),
    variables: (p) => ({
      title: 'License expiring',
      body: `Therapist license expires on ${p.expiryDate ?? 'soon'}.`,
    }),
  },
  {
    event: EventNames.EMPLOYEE_CONTRACT_EXPIRING,
    typeCode: 'employee.contract.expiring',
    recipients: async (_p, ctx) => ctx.resolveRoles(['hr_officer']),
    variables: (p) => ({
      title: 'Contract expiring',
      body: `Employee contract expires on ${p.expiryDate ?? 'soon'}.`,
    }),
  },
  {
    event: EventNames.INVENTORY_STOCK_LOW,
    typeCode: 'inventory.stock.low',
    recipients: async (_p, ctx) => ctx.resolveRoles(['procurement_officer']),
    variables: (p) => ({
      title: 'Low stock alert',
      body: `Item ${p.itemId ?? ''} is below minimum stock.`,
    }),
    groupKey: (p) => `stock:${p.itemId}:${p.locationId}`,
  },
  {
    event: EventNames.PROCUREMENT_PR_STATUS_CHANGED,
    typeCode: 'procurement.pr.status',
    recipients: async (p, ctx) => {
      const r = await ctx.resolvePrRequester(String(p.prId ?? p.id));
      return r ? [r] : [];
    },
    variables: (p) => ({
      title: 'PR status update',
      body: `Purchase request status changed to ${p.status ?? 'updated'}.`,
    }),
  },
  {
    event: EventNames.REPORT_EXPORT_READY,
    typeCode: 'report.export.ready',
    recipients: async (p, ctx) => {
      const r = await ctx.resolveUser(String(p.userId ?? p.requestedBy));
      return r ? [r] : [];
    },
    variables: (p) => ({
      title: 'Export ready',
      body: 'Your report export is ready for download.',
      jobId: p.jobId,
      downloadUrl: p.downloadUrl,
    }),
  },
];

export function assertNotificationMappingComplete(
  typeCodes: Set<string>,
): void {
  const mappedEvents = new Set(NOTIFICATION_MAP.map((m) => m.event));
  const missing = NOTIFIABLE_EVENTS.filter((e) => !mappedEvents.has(e));
  if (missing.length) {
    throw new Error(
      `NOTIFICATION_MAP missing notifiable events: ${missing.join(', ')}`,
    );
  }
  for (const entry of NOTIFICATION_MAP) {
    if (!typeCodes.has(entry.typeCode)) {
      throw new Error(
        `NOTIFICATION_MAP typeCode "${entry.typeCode}" not in notification_types seed`,
      );
    }
  }
}
