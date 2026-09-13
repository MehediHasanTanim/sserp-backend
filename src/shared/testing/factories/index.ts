import { Factory } from 'fishery';
import { faker } from '@faker-js/faker';

faker.seed(11);

export const userFactory = Factory.define<{
  id: string;
  username: string;
  email: string;
  password: string;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  username: `user${sequence}`,
  email: faker.internet.email({ provider: 'example.test' }).toLowerCase(),
  password: 'ValidPass1',
}));

export const studentFactory = Factory.define<{
  id: string;
  studentCode: string;
  fullName: string;
  dateOfBirth: Date;
  gender: string;
  disabilityCategory: string;
  severityLevel: string;
  shiftId: string;
  status: string;
  enrollmentDate: Date;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  studentCode: `STU-${String(sequence).padStart(4, '0')}`,
  fullName: faker.person.fullName(),
  dateOfBirth: faker.date.birthdate({ min: 3, max: 18, mode: 'age' }),
  gender: faker.helpers.arrayElement(['Male', 'Female']),
  disabilityCategory: faker.helpers.arrayElement([
    'Autism',
    'Down Syndrome',
    'Cerebral Palsy',
  ]),
  severityLevel: faker.helpers.arrayElement(['Mild', 'Moderate', 'Severe']),
  shiftId: faker.string.uuid(),
  status: 'pending_admission_fee',
  enrollmentDate: new Date('2026-01-15T00:00:00.000Z'),
}));

export const pendingFeeStudent = studentFactory.params({
  status: 'pending_admission_fee',
});
export const activeStudent = studentFactory.params({ status: 'active' });
export const graduatedStudent = studentFactory.params({ status: 'graduated' });

export const guardianFactory = Factory.define<{
  id: string;
  fullName: string;
  relationship: string;
  phone: string;
  email: string;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  fullName: faker.person.fullName(),
  relationship: faker.helpers.arrayElement(['father', 'mother', 'guardian']),
  // Fictional US-style — avoids BD 01XXXXXXXXX CI grep (see check-sensitive-fixtures).
  phone: `+1555${String(1000000 + sequence).slice(-7)}`,
  email: faker.internet.email({ provider: 'example.test' }).toLowerCase(),
}));

export const employeeFactory = Factory.define<{
  id: string;
  employeeCode: string;
  fullName: string;
  department: string;
  designation: string;
  employmentType: string;
  joiningDate: Date;
  basicSalary: number;
  status: string;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  employeeCode: `EMP-${String(sequence).padStart(4, '0')}`,
  fullName: faker.person.fullName(),
  department: faker.helpers.arrayElement([
    'school',
    'therapy',
    'administration',
    'support',
  ]),
  designation: 'Teacher',
  employmentType: 'permanent',
  joiningDate: new Date('2020-01-01T00:00:00.000Z'),
  basicSalary: 50_000_00,
  status: 'active',
}));

export const patientFactory = Factory.define<{
  id: string;
  patientCode: string;
  fullName: string;
  dateOfBirth: Date;
  status: string;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  patientCode: `PAT-${String(sequence).padStart(4, '0')}`,
  fullName: faker.person.fullName(),
  dateOfBirth: faker.date.birthdate({ min: 2, max: 25, mode: 'age' }),
  status: 'active',
}));

export const therapistFactory = Factory.define<{
  id: string;
  employeeId: string;
  specialisation: string;
  status: string;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  employeeId: faker.string.uuid(),
  specialisation: faker.helpers.arrayElement([
    'speech',
    'ot',
    'pt',
    'aba',
    'psychology',
    'special_ed',
  ]),
  status: sequence % 2 === 0 ? 'active' : 'active',
}));

export const skillDomainFactory = Factory.define<{
  id: string;
  name: string;
  description: string | null;
  sequence: number;
  isActive: boolean;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  name: `Domain ${sequence}`,
  description: faker.lorem.sentence(),
  sequence,
  isActive: true,
}));

export const iepPlanFactory = Factory.define<{
  id: string;
  studentId: string;
  academicYearId: string;
  version: number;
  status: string;
  reviewFrequencyMonths: number;
  nextReviewDate: Date | null;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  studentId: faker.string.uuid(),
  academicYearId: faker.string.uuid(),
  version: sequence,
  status: 'draft',
  reviewFrequencyMonths: 3,
  nextReviewDate: null,
}));

export const iepGoalFactory = Factory.define<{
  id: string;
  iepId: string;
  skillDomainId: string;
  description: string;
  status: string;
  progressPercentage: number;
  sequence: number;
  responsibleTeacherId: string | null;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  iepId: faker.string.uuid(),
  skillDomainId: faker.string.uuid(),
  description: faker.lorem.sentence(),
  status: 'not_started',
  progressPercentage: 0,
  sequence,
  responsibleTeacherId: faker.string.uuid(),
}));

export const iepReviewFactory = Factory.define<{
  id: string;
  iepId: string;
  scheduledDate: Date;
  reviewType: string;
  status: string;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  iepId: faker.string.uuid(),
  scheduledDate: new Date(`2026-${String(((sequence - 1) % 12) + 1).padStart(2, '0')}-15T00:00:00.000Z`),
  reviewType: 'quarterly',
  status: 'scheduled',
}));

export const reportTemplateFactory = Factory.define<{
  id: string;
  name: string;
  reportType: string;
  disabilityCategory: string | null;
  sections: Record<string, unknown>;
  isActive: boolean;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  name: `Template ${sequence}`,
  reportType: 'monthly_progress',
  disabilityCategory: null,
  sections: { narrative: true },
  isActive: true,
}));

export const progressReportFactory = Factory.define<{
  id: string;
  studentId: string;
  templateId: string;
  reportType: string;
  periodStart: Date;
  periodEnd: Date;
  academicYearId: string;
  status: string;
}>(() => ({
  id: faker.string.uuid(),
  studentId: faker.string.uuid(),
  templateId: faker.string.uuid(),
  reportType: 'monthly_progress',
  periodStart: new Date('2026-01-01T00:00:00.000Z'),
  periodEnd: new Date('2026-01-31T00:00:00.000Z'),
  academicYearId: faker.string.uuid(),
  status: 'draft',
}));

export const feeHeadFactory = Factory.define<{
  id: string;
  code: string;
  name: string;
  headType: string;
  isRecurring: boolean;
  isActive: boolean;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  code: `HEAD-${String(sequence).padStart(3, '0')}`,
  name: faker.commerce.productName(),
  headType: faker.helpers.arrayElement(['tuition', 'transport', 'material', 'other']),
  isRecurring: true,
  isActive: true,
}));

export const feeStructureFactory = Factory.define<{
  id: string;
  academicYearId: string;
  feeCategoryId: string;
  feeHeadId: string;
  amount: number;
  frequency: string;
  effectiveFrom: Date;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  academicYearId: faker.string.uuid(),
  feeCategoryId: faker.string.uuid(),
  feeHeadId: faker.string.uuid(),
  amount: 5_000_00 + sequence * 100,
  frequency: 'monthly',
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
}));

export const feeInvoiceFactory = Factory.define<{
  id: string;
  studentId: string;
  invoiceNumber: string;
  academicYearId: string;
  invoiceType: string;
  totalAmount: number;
  netAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: string;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  studentId: faker.string.uuid(),
  invoiceNumber: `INV-${String(sequence).padStart(6, '0')}`,
  academicYearId: faker.string.uuid(),
  invoiceType: 'monthly',
  totalAmount: 5_000_00,
  netAmount: 5_000_00,
  paidAmount: 0,
  outstandingAmount: 5_000_00,
  status: 'issued',
}));

export const feePaymentFactory = Factory.define<{
  id: string;
  receiptNumber: string;
  invoiceId: string;
  studentId: string;
  amount: number;
  method: string;
  paymentDate: Date;
  receivedBy: string;
  status: string;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  receiptNumber: `RCP-${String(sequence).padStart(6, '0')}`,
  invoiceId: faker.string.uuid(),
  studentId: faker.string.uuid(),
  amount: 1_000_00,
  method: 'cash',
  paymentDate: new Date('2026-02-01T00:00:00.000Z'),
  receivedBy: faker.string.uuid(),
  status: 'recorded',
}));

export const discountFactory = Factory.define<{
  id: string;
  studentId: string;
  discountType: string;
  value: number;
  feeHeadId: string | null;
  status: string;
  effectiveFrom: Date;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  studentId: faker.string.uuid(),
  discountType: sequence % 2 === 0 ? 'percentage' : 'fixed',
  value: sequence % 2 === 0 ? 10 : 500_00,
  feeHeadId: null,
  status: 'pending',
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
}));

export const activityFactory = Factory.define<{
  id: string;
  activityTypeId: string;
  name: string;
  activityDate: Date;
  capacity: number;
  feeAmount: number;
  optInDeadline: Date;
  waitlistEnabled: boolean;
  status: string;
  participantCount: number;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  activityTypeId: faker.string.uuid(),
  name: `Activity ${sequence}`,
  activityDate: new Date('2026-03-15T00:00:00.000Z'),
  capacity: 20,
  feeAmount: 500_00,
  optInDeadline: new Date('2026-03-10T00:00:00.000Z'),
  waitlistEnabled: true,
  status: 'upcoming',
  participantCount: 0,
}));

export const activityEnrollmentFactory = Factory.define<{
  id: string;
  activityId: string;
  studentId: string;
  consentStatus: string;
  enrollmentState: string;
  waitlistPosition: number | null;
  feeStatus: string;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  activityId: faker.string.uuid(),
  studentId: faker.string.uuid(),
  consentStatus: 'pending',
  enrollmentState: 'waitlisted',
  waitlistPosition: sequence,
  feeStatus: 'pending',
}));

export const studentLeaveRequestFactory = Factory.define<{
  id: string;
  studentId: string;
  requestedBy: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  status: string;
}>(() => ({
  id: faker.string.uuid(),
  studentId: faker.string.uuid(),
  requestedBy: faker.string.uuid(),
  leaveType: faker.helpers.arrayElement(['medical', 'family', 'other']),
  startDate: new Date('2026-04-01T00:00:00.000Z'),
  endDate: new Date('2026-04-03T00:00:00.000Z'),
  totalDays: 3,
  status: 'pending',
}));

export const medicalRecordFactory = Factory.define<{
  id: string;
  studentId: string;
  bloodGroup: string | null;
  hasAlertFlag: boolean;
  alertSummary: string | null;
  emergencyProtocol: string | null;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  studentId: faker.string.uuid(),
  bloodGroup: faker.helpers.arrayElement(['A+', 'B+', 'O+', 'AB+', null]),
  hasAlertFlag: sequence % 3 === 0,
  alertSummary: sequence % 3 === 0 ? faker.lorem.sentence() : null,
  emergencyProtocol: null,
}));

export const behavioralIncidentFactory = Factory.define<{
  id: string;
  studentId: string;
  incidentDatetime: Date;
  behaviorType: string;
  description: string;
  recordedBy: string;
  linkedIepGoalId: string | null;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  studentId: faker.string.uuid(),
  incidentDatetime: new Date(`2026-05-${String(((sequence - 1) % 28) + 1).padStart(2, '0')}T10:00:00.000Z`),
  behaviorType: faker.helpers.arrayElement(['aggression', 'elopement', 'self_injury']),
  description: faker.lorem.sentence(),
  recordedBy: faker.string.uuid(),
  linkedIepGoalId: null,
}));

export const journalFactory = Factory.define<{
  id: string;
  entryNumber: string;
  totalDebit: number;
  totalCredit: number;
  status: string;
  description: string;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  entryNumber: `JE-${String(sequence).padStart(6, '0')}`,
  totalDebit: 1_000_00,
  totalCredit: 1_000_00,
  status: 'posted',
  description: faker.lorem.sentence(),
}));

export const payrollRunFactory = Factory.define<{
  id: string;
  year: number;
  month: number;
  status: string;
  employeeCount: number;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  year: 2026,
  month: ((sequence - 1) % 12) + 1,
  status: 'draft',
  employeeCount: 10,
}));

export const stockItemFactory = Factory.define<{
  id: string;
  sku: string;
  name: string;
  unit: string;
  reorderLevel: number;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  sku: `SKU-${String(sequence).padStart(5, '0')}`,
  name: faker.commerce.productName(),
  unit: 'pcs',
  reorderLevel: 10,
}));

export const vendorFactory = Factory.define<{
  id: string;
  code: string;
  name: string;
  status: string;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  code: `VEN-${String(sequence).padStart(4, '0')}`,
  name: faker.company.name(),
  status: 'active',
}));

export const notificationFactory = Factory.define<{
  id: string;
  typeCode: string;
  title: string;
  body: string;
  channel: string;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  typeCode: 'student.activated',
  title: `Notification ${sequence}`,
  body: faker.lorem.sentence(),
  channel: 'in_app',
}));

export function createServiceMock<T extends object>(): jest.Mocked<T> {
  return {} as jest.Mocked<T>;
}
