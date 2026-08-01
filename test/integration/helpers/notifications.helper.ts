import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/shared/prisma/prisma.service';
import { issueTestToken } from '../../../src/shared/testing/auth.helper';

export async function createNotificationsTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export async function issueStaffToken(
  app: INestApplication,
  role:
    | 'coordinator'
    | 'principal'
    | 'super_admin'
    | 'teacher'
    | 'hr_officer'
    | 'accountant' = 'coordinator',
) {
  const prisma = app.get(PrismaService);
  const user = await prisma.user.findFirst({
    where: { roles: { some: { role: { name: role } } } },
  });
  if (!user) throw new Error(`No seeded user for role ${role}`);
  return issueTestToken({
    userId: user.id,
    role,
    permissions: ['notifications:read'],
  });
}

/** TDD 10.3 ∪ feature 11.2 — channel defaults must match seed (NT-16). */
export const TDD_103_MATRIX: Array<{
  code: string;
  defaultChannels: string[];
}> = [
  { code: 'student.activated', defaultChannels: ['in_app', 'email', 'sms'] },
  { code: 'student.absent', defaultChannels: ['in_app', 'sms'] },
  {
    code: 'admission_fee.pending',
    defaultChannels: ['in_app', 'email', 'sms'],
  },
  { code: 'fee.overdue', defaultChannels: ['in_app', 'email', 'sms'] },
  {
    code: 'student_leave.decided',
    defaultChannels: ['in_app', 'email', 'sms'],
  },
  { code: 'student_leave.submitted', defaultChannels: ['in_app', 'email'] },
  { code: 'iep.updated', defaultChannels: ['in_app', 'email'] },
  { code: 'iep.review_due', defaultChannels: ['in_app', 'email'] },
  { code: 'progress_report.available', defaultChannels: ['in_app', 'email'] },
  {
    code: 'activity.optin_invite',
    defaultChannels: ['in_app', 'email', 'sms'],
  },
  {
    code: 'activity.optin_reminder',
    defaultChannels: ['in_app', 'email', 'sms'],
  },
  { code: 'activity.cancelled', defaultChannels: ['in_app', 'email', 'sms'] },
  { code: 'activity.fee_unpaid', defaultChannels: ['in_app', 'email', 'sms'] },
  {
    code: 'therapy_session.cancelled',
    defaultChannels: ['in_app', 'email', 'sms'],
  },
  { code: 'therapy_session.reminder', defaultChannels: ['in_app', 'sms'] },
  { code: 'substitute.unassigned', defaultChannels: ['in_app', 'email'] },
  { code: 'hr.leave.decided', defaultChannels: ['in_app', 'email'] },
  { code: 'payroll.processed', defaultChannels: ['in_app', 'email'] },
  { code: 'gratuity.eligibility', defaultChannels: ['in_app', 'email'] },
  { code: 'encashment.decided', defaultChannels: ['in_app', 'email'] },
  { code: 'therapist.license.expiring', defaultChannels: ['in_app', 'email'] },
  { code: 'employee.contract.expiring', defaultChannels: ['in_app', 'email'] },
  { code: 'inventory.stock.low', defaultChannels: ['in_app', 'email'] },
  { code: 'procurement.pr.status', defaultChannels: ['in_app', 'email'] },
  { code: 'report.export.ready', defaultChannels: ['in_app'] },
];
