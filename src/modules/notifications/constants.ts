export const REALTIME_GATEWAY = Symbol('REALTIME_GATEWAY');
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export const ORG_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export type NotificationChannel = 'in_app' | 'email' | 'sms';

export const LEGACY_TYPE_MAP: Record<string, string> = {
  unauthorized_absence: 'student.absent',
  admission_fee: 'student.activated',
  fee_overdue: 'fee.overdue',
  fee_reminder: 'fee.overdue',
  student_leave: 'student_leave.decided',
  iep: 'iep.updated',
  progress_report: 'progress_report.available',
  activity: 'activity.optin_invite',
  therapy_session: 'therapy_session.cancelled',
  substitute: 'substitute.unassigned',
  hr_leave: 'hr.leave.decided',
  payroll: 'payroll.processed',
  gratuity: 'gratuity.eligibility',
  encashment: 'encashment.decided',
  license_expiring: 'therapist.license.expiring',
  contract_expiring: 'employee.contract.expiring',
  stock_low: 'inventory.stock.low',
  pr_status: 'procurement.pr.status',
  report_export: 'report.export.ready',
};

export const SENSITIVE_SOCKET_FIELDS = [
  'salary',
  'netPay',
  'grossPay',
  'amount',
  'balance',
  'diagnosis',
  'medical',
  'bankAccount',
  'nationalId',
  'password',
  'token',
];
