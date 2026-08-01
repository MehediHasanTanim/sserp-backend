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

export const feeInvoiceFactory = Factory.define<{
  id: string;
  studentId: string;
  invoiceNumber: string;
  totalAmount: number;
  paidAmount: number;
  status: string;
}>(({ sequence }) => ({
  id: faker.string.uuid(),
  studentId: faker.string.uuid(),
  invoiceNumber: `INV-${String(sequence).padStart(6, '0')}`,
  totalAmount: 5_000_00,
  paidAmount: 0,
  status: 'open',
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
