import {
  PrismaClient,
  NotificationChannel,
  NotificationPriority,
  ApproverType,
  Prisma,
} from '@prisma/client';

type Channel = 'in_app' | 'email' | 'sms';

type NotificationTypeSeed = {
  code: string;
  name: string;
  description: string;
  module: string;
  category: string;
  defaultChannels: Channel[];
  allowedChannels: Channel[];
  priority: NotificationPriority;
  supportsDigest?: boolean;
};

/** TDD 10.3 / phase plan §7 — all 25 notification types */
export const NOTIFICATION_TYPES: NotificationTypeSeed[] = [
  {
    code: 'student.activated',
    name: 'Student Activated',
    description: 'A student account has been activated after admission fee payment or waiver.',
    module: 'school',
    category: 'enrollment',
    defaultChannels: ['in_app', 'email', 'sms'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'student.absent',
    name: 'Unauthorized Absence',
    description: 'A student was marked absent without authorized leave.',
    module: 'school',
    category: 'attendance',
    defaultChannels: ['in_app', 'sms'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'critical',
    supportsDigest: false,
  },
  {
    code: 'admission_fee.pending',
    name: 'Admission Fee Pending',
    description: 'Reminder that admission fee is still outstanding.',
    module: 'school',
    category: 'fees',
    defaultChannels: ['in_app', 'email', 'sms'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'fee.overdue',
    name: 'Fee Overdue',
    description: 'A fee invoice is overdue.',
    module: 'school',
    category: 'fees',
    defaultChannels: ['in_app', 'email', 'sms'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'high',
  },
  {
    code: 'student_leave.decided',
    name: 'Student Leave Decision',
    description: 'A student leave request was approved or rejected.',
    module: 'school',
    category: 'leave',
    defaultChannels: ['in_app', 'email', 'sms'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'student_leave.submitted',
    name: 'Student Leave Submitted',
    description: 'A new student leave request was submitted.',
    module: 'school',
    category: 'leave',
    defaultChannels: ['in_app', 'email'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'iep.updated',
    name: 'IEP Updated',
    description: 'An IEP was published or revised.',
    module: 'school',
    category: 'iep',
    defaultChannels: ['in_app', 'email'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'iep.review_due',
    name: 'IEP Review Due',
    description: 'An IEP review is approaching or overdue.',
    module: 'school',
    category: 'iep',
    defaultChannels: ['in_app', 'email'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'progress_report.available',
    name: 'Progress Report Available',
    description: 'A progress report has been published.',
    module: 'school',
    category: 'academics',
    defaultChannels: ['in_app', 'email'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'activity.optin_invite',
    name: 'Activity Opt-in Invite',
    description: 'Invitation to opt in to a school activity.',
    module: 'school',
    category: 'activities',
    defaultChannels: ['in_app', 'email', 'sms'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'activity.optin_reminder',
    name: 'Activity Opt-in Reminder',
    description: 'Reminder to respond to an activity opt-in invitation.',
    module: 'school',
    category: 'activities',
    defaultChannels: ['in_app', 'email', 'sms'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'activity.cancelled',
    name: 'Activity Cancelled',
    description: 'A scheduled activity was cancelled.',
    module: 'school',
    category: 'activities',
    defaultChannels: ['in_app', 'email', 'sms'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'high',
    supportsDigest: false,
  },
  {
    code: 'activity.fee_unpaid',
    name: 'Activity Fee Unpaid',
    description: 'Activity fee remains unpaid after the deadline.',
    module: 'school',
    category: 'activities',
    defaultChannels: ['in_app', 'email', 'sms'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'therapy_session.cancelled',
    name: 'Therapy Session Cancelled',
    description: 'An individual or group therapy session was cancelled.',
    module: 'therapy',
    category: 'sessions',
    defaultChannels: ['in_app', 'email', 'sms'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'critical',
    supportsDigest: false,
  },
  {
    code: 'therapy_session.reminder',
    name: 'Therapy Session Reminder',
    description: 'Upcoming therapy session reminder.',
    module: 'therapy',
    category: 'sessions',
    defaultChannels: ['in_app', 'sms'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'substitute.unassigned',
    name: 'Substitute Unassigned',
    description: 'A substitute teacher assignment could not be filled.',
    module: 'school',
    category: 'staff',
    defaultChannels: ['in_app', 'email'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'high',
  },
  {
    code: 'hr.leave.decided',
    name: 'HR Leave Decision',
    description: 'An employee leave request was approved or rejected.',
    module: 'hr',
    category: 'leave',
    defaultChannels: ['in_app', 'email'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'hr.attendance.anomaly',
    name: 'HR Attendance Anomaly',
    description: 'Late or early-leave streak requiring HR attention.',
    module: 'hr',
    category: 'attendance',
    defaultChannels: ['in_app', 'email'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'high',
  },
  {
    code: 'payroll.processed',
    name: 'Payroll Processed',
    description: 'A payroll run has been completed.',
    module: 'hr',
    category: 'payroll',
    defaultChannels: ['in_app', 'email'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'gratuity.eligibility',
    name: 'Gratuity Eligibility',
    description: 'An employee has reached gratuity eligibility.',
    module: 'hr',
    category: 'gratuity',
    defaultChannels: ['in_app', 'email'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'encashment.decided',
    name: 'Leave Encashment Decision',
    description: 'A leave encashment request was approved or rejected.',
    module: 'hr',
    category: 'leave',
    defaultChannels: ['in_app', 'email'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'therapist.license.expiring',
    name: 'Therapist License Expiring',
    description: 'A therapist professional license is expiring soon.',
    module: 'therapy',
    category: 'compliance',
    defaultChannels: ['in_app', 'email'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'high',
  },
  {
    code: 'employee.contract.expiring',
    name: 'Employee Contract Expiring',
    description: 'An employee contract is approaching its end date.',
    module: 'hr',
    category: 'workforce',
    defaultChannels: ['in_app', 'email'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'high',
  },
  {
    code: 'inventory.stock.low',
    name: 'Low Stock Alert',
    description: 'Inventory item has fallen below reorder level.',
    module: 'inventory',
    category: 'stock',
    defaultChannels: ['in_app', 'email'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'high',
  },
  {
    code: 'procurement.pr.status',
    name: 'Purchase Request Status',
    description: 'Purchase request status changed.',
    module: 'procurement',
    category: 'procurement',
    defaultChannels: ['in_app', 'email'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
  },
  {
    code: 'report.export.ready',
    name: 'Report Export Ready',
    description: 'An async report export is ready for download.',
    module: 'reports',
    category: 'exports',
    defaultChannels: ['in_app'],
    allowedChannels: ['in_app', 'email', 'sms'],
    priority: 'normal',
    supportsDigest: false,
  },
];


function templateBody(type: NotificationTypeSeed, channel: Channel): string {
  if (channel === 'sms') {
    return `{{title}} — see portal for details.`;
  }
  if (channel === 'email') {
    return `<p>{{body}}</p>`;
  }
  return '{{body}}';
}

function templateSubject(type: NotificationTypeSeed, channel: Channel): string | null {
  if (channel === 'in_app') return null;
  return type.name;
}

type ApprovalChainSeed = {
  workflowCode: string;
  name: string;
  description: string;
  steps: Array<{
    level: number;
    approverType: ApproverType;
    approverRole?: string;
    condition?: Prisma.InputJsonValue;
    isMandatory?: boolean;
    escalationAfterHours?: number;
    escalateToRole?: string;
  }>;
};

/** Reproduce hardcoded approval flows from phases 1–6 */
const APPROVAL_CHAINS: ApprovalChainSeed[] = [
  {
    workflowCode: 'purchase_request',
    name: 'Purchase Request Approval',
    description: 'Department review then mandatory principal approval.',
    steps: [
      {
        level: 1,
        approverType: 'department_head',
        approverRole: 'coordinator',
        isMandatory: true,
        escalationAfterHours: 48,
        escalateToRole: 'principal',
      },
      {
        level: 2,
        approverType: 'role',
        approverRole: 'principal',
        isMandatory: true,
      },
    ],
  },
  {
    workflowCode: 'hr_leave',
    name: 'HR Leave Approval',
    description: 'HR officer review then principal approval.',
    steps: [
      { level: 1, approverType: 'role', approverRole: 'hr_officer', isMandatory: true },
      { level: 2, approverType: 'role', approverRole: 'principal', isMandatory: true },
    ],
  },
  {
    workflowCode: 'student_leave',
    name: 'Student Leave Approval',
    description: 'Coordinator or principal may approve student leave.',
    steps: [
      { level: 1, approverType: 'role', approverRole: 'coordinator', isMandatory: true },
    ],
  },
  {
    workflowCode: 'iep_publish',
    name: 'IEP Publish Approval',
    description: 'Principal approves IEP publication.',
    steps: [
      { level: 1, approverType: 'role', approverRole: 'principal', isMandatory: true },
    ],
  },
  {
    workflowCode: 'fee_waiver',
    name: 'Fee Waiver Approval',
    description: 'Principal approval required for fee waivers.',
    steps: [
      { level: 1, approverType: 'role', approverRole: 'principal', isMandatory: true },
    ],
  },
  {
    workflowCode: 'payroll_run',
    name: 'Payroll Run Approval',
    description: 'Principal approves calculated payroll run.',
    steps: [
      { level: 1, approverType: 'role', approverRole: 'principal', isMandatory: true },
    ],
  },
  {
    workflowCode: 'journal_entry',
    name: 'Journal Entry Approval',
    description: 'Principal approves submitted journal entries.',
    steps: [
      { level: 1, approverType: 'role', approverRole: 'principal', isMandatory: true },
    ],
  },
  {
    workflowCode: 'encashment',
    name: 'Leave Encashment Approval',
    description: 'HR officer then principal approval for encashment.',
    steps: [
      { level: 1, approverType: 'role', approverRole: 'hr_officer', isMandatory: true },
      { level: 2, approverType: 'role', approverRole: 'principal', isMandatory: true },
    ],
  },
  {
    workflowCode: 'discount',
    name: 'Student Discount Approval',
    description: 'Principal approves discounts above auto-approve threshold.',
    steps: [
      {
        level: 1,
        approverType: 'role',
        approverRole: 'principal',
        isMandatory: true,
        condition: {
          field: 'discountPercent',
          op: 'gt',
          value: 10,
        },
      },
    ],
  },
];

type ReminderSeed = {
  reminderCode: string;
  name: string;
  targetEvent: string;
  offsetDays: number;
  repeatIntervalDays?: number;
  maxRepeats?: number;
  channels: Channel[];
};

/** Defaults aligned with organization_settings.fee_reminder_days [3, 7, 15, 30] */
const REMINDER_SCHEDULES: ReminderSeed[] = [
  {
    reminderCode: 'admission_fee.pending.7d',
    name: 'Admission fee — 7 days before due',
    targetEvent: 'admission_fee.pending',
    offsetDays: -7,
    channels: ['in_app', 'email', 'sms'],
  },
  {
    reminderCode: 'admission_fee.pending.3d',
    name: 'Admission fee — 3 days before due',
    targetEvent: 'admission_fee.pending',
    offsetDays: -3,
    channels: ['in_app', 'email', 'sms'],
  },
  {
    reminderCode: 'admission_fee.pending.1d',
    name: 'Admission fee — 1 day before due',
    targetEvent: 'admission_fee.pending',
    offsetDays: -1,
    channels: ['in_app', 'email', 'sms'],
  },
  {
    reminderCode: 'fee.overdue.3d',
    name: 'Fee overdue — 3 days',
    targetEvent: 'fee.overdue',
    offsetDays: 3,
    channels: ['in_app', 'email', 'sms'],
  },
  {
    reminderCode: 'fee.overdue.7d',
    name: 'Fee overdue — 7 days',
    targetEvent: 'fee.overdue',
    offsetDays: 7,
    channels: ['in_app', 'email', 'sms'],
  },
  {
    reminderCode: 'fee.overdue.15d',
    name: 'Fee overdue — 15 days',
    targetEvent: 'fee.overdue',
    offsetDays: 15,
    channels: ['in_app', 'email', 'sms'],
  },
  {
    reminderCode: 'fee.overdue.30d',
    name: 'Fee overdue — 30 days',
    targetEvent: 'fee.overdue',
    offsetDays: 30,
    channels: ['in_app', 'email', 'sms'],
  },
  {
    reminderCode: 'iep.review_due.14d',
    name: 'IEP review due — 14 days before',
    targetEvent: 'iep.review_due',
    offsetDays: -14,
    channels: ['in_app', 'email'],
  },
  {
    reminderCode: 'iep.review_due.7d',
    name: 'IEP review due — 7 days before',
    targetEvent: 'iep.review_due',
    offsetDays: -7,
    channels: ['in_app', 'email'],
  },
  {
    reminderCode: 'activity.optin_reminder.3d',
    name: 'Activity opt-in — 3 days before deadline',
    targetEvent: 'activity.optin_reminder',
    offsetDays: -3,
    channels: ['in_app', 'email', 'sms'],
  },
  {
    reminderCode: 'activity.optin_reminder.1d',
    name: 'Activity opt-in — 1 day before deadline',
    targetEvent: 'activity.optin_reminder',
    offsetDays: -1,
    channels: ['in_app', 'email', 'sms'],
  },
  {
    reminderCode: 'activity.fee_unpaid.3d',
    name: 'Activity fee unpaid — 3 days overdue',
    targetEvent: 'activity.fee_unpaid',
    offsetDays: 3,
    channels: ['in_app', 'email', 'sms'],
  },
  {
    reminderCode: 'activity.fee_unpaid.7d',
    name: 'Activity fee unpaid — 7 days overdue',
    targetEvent: 'activity.fee_unpaid',
    offsetDays: 7,
    channels: ['in_app', 'email', 'sms'],
  },
  {
    reminderCode: 'therapy_session.reminder.1d',
    name: 'Therapy session — 1 day before',
    targetEvent: 'therapy_session.reminder',
    offsetDays: -1,
    channels: ['in_app', 'sms'],
  },
];

export async function seedPhase8(prisma: PrismaClient): Promise<void> {
  console.log('Phase 8 seed: notification types, templates, workflows…');

  for (const type of NOTIFICATION_TYPES) {
    await prisma.notificationType.upsert({
      where: { code: type.code },
      create: {
        code: type.code,
        name: type.name,
        description: type.description,
        module: type.module,
        category: type.category,
        defaultChannels: type.defaultChannels,
        allowedChannels: type.allowedChannels,
        priority: type.priority,
        supportsDigest: type.supportsDigest ?? true,
        isUserConfigurable: true,
        isActive: true,
      },
      update: {
        name: type.name,
        description: type.description,
        module: type.module,
        category: type.category,
        defaultChannels: type.defaultChannels,
        allowedChannels: type.allowedChannels,
        priority: type.priority,
        supportsDigest: type.supportsDigest ?? true,
        isActive: true,
      },
    });

    for (const channel of type.defaultChannels) {
      const prismaChannel = channel as NotificationChannel;
      await prisma.notificationTemplate.upsert({
        where: {
          notificationTypeCode_channel_locale_isActive: {
            notificationTypeCode: type.code,
            channel: prismaChannel,
            locale: 'en',
            isActive: true,
          },
        },
        create: {
          notificationTypeCode: type.code,
          channel: prismaChannel,
          locale: 'en',
          subject: templateSubject(type, channel),
          body: templateBody(type, channel),
          variables: ['title', 'body'],
          isActive: true,
          version: 1,
        },
        update: {
          subject: templateSubject(type, channel),
          body: templateBody(type, channel),
          variables: ['title', 'body'],
        },
      });
    }
  }

  for (const chain of APPROVAL_CHAINS) {
    const existing = await prisma.approvalChain.findFirst({
      where: { workflowCode: chain.workflowCode, version: 1 },
    });

    const chainRow =
      existing ??
      (await prisma.approvalChain.create({
        data: {
          workflowCode: chain.workflowCode,
          name: chain.name,
          description: chain.description,
          isActive: true,
          version: 1,
        },
      }));

    if (!existing) {
      await prisma.approvalChainStep.createMany({
        data: chain.steps.map((step) => ({
          approvalChainId: chainRow.id,
          level: step.level,
          approverType: step.approverType,
          approverRole: step.approverRole,
          condition: step.condition ?? undefined,
          isMandatory: step.isMandatory ?? true,
          escalationAfterHours: step.escalationAfterHours,
          escalateToRole: step.escalateToRole,
        })),
      });
    } else {
      await prisma.approvalChain.update({
        where: { id: chainRow.id },
        data: {
          name: chain.name,
          description: chain.description,
          isActive: true,
        },
      });
    }
  }

  for (const reminder of REMINDER_SCHEDULES) {
    await prisma.reminderSchedule.upsert({
      where: { reminderCode: reminder.reminderCode },
      create: {
        reminderCode: reminder.reminderCode,
        name: reminder.name,
        targetEvent: reminder.targetEvent,
        offsetDays: reminder.offsetDays,
        repeatIntervalDays: reminder.repeatIntervalDays,
        maxRepeats: reminder.maxRepeats,
        channels: reminder.channels,
        isActive: true,
      },
      update: {
        name: reminder.name,
        targetEvent: reminder.targetEvent,
        offsetDays: reminder.offsetDays,
        repeatIntervalDays: reminder.repeatIntervalDays,
        maxRepeats: reminder.maxRepeats,
        channels: reminder.channels,
        isActive: true,
      },
    });
  }

  console.log(
    `Phase 8 seed complete: ${NOTIFICATION_TYPES.length} types, ${APPROVAL_CHAINS.length} approval chains, ${REMINDER_SCHEDULES.length} reminder schedules`,
  );
}
