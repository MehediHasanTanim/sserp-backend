import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { LeaveRequestService } from '../../src/modules/hr/services/leave-request.service';
import { LeaveApprovalService } from '../../src/modules/hr/services/leave-approval.service';
import { LeaveBalanceService } from '../../src/modules/hr/services/leave-balance.service';

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Advances to the next date that isn't a Friday/Saturday (default weekly off). */
function nextWorkingDay(date: Date): Date {
  const d = new Date(date);
  while (d.getUTCDay() === 5 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

/** UTC-midnight date `n` days from now — clear of any of the demo seed's fixed holidays. */
function daysFromNowUtc(n: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n),
  );
}

/**
 * L-01/L-04/L-05: submitting holds `pending_days`; final-level approval
 * moves those days to `consumed_days` and writes `hr_attendance` leave rows.
 * See docs/plan/backend/02-phase1-hr-school-core.md §11.
 */
describe('HR leave request lifecycle integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let leaveRequests: LeaveRequestService;
  let leaveApprovals: LeaveApprovalService;
  let leaveBalances: LeaveBalanceService;
  let employeeId: string;
  let leaveTypeId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    leaveRequests = app.get(LeaveRequestService);
    leaveApprovals = app.get(LeaveApprovalService);
    leaveBalances = app.get(LeaveBalanceService);

    const employee = await prisma.employee.create({
      data: {
        employeeCode: `EMP-TEST-${randomUUID()}`,
        fullName: 'Leave Flow Test Employee',
        department: 'administration',
        designation: 'Test Officer',
        employmentType: 'permanent',
        joiningDate: new Date('2020-01-01'),
        basicSalary: 30000,
        status: 'active',
      },
    });
    employeeId = employee.id;

    const leaveType = await prisma.leaveType.findUniqueOrThrow({
      where: { code: 'ANNUAL' },
    });
    leaveTypeId = leaveType.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('holds pending_days on submit, then moves to consumed_days on final approval', async () => {
    // Two consecutive working days, far enough out to be clear of any
    // near-term data from other tests. `year` must match the request's
    // startDate year since that's what the balance services key off.
    const start = nextWorkingDay(daysFromNowUtc(90));
    const end = nextWorkingDay(new Date(start.getTime() + 24 * 3600 * 1000));
    const year = start.getUTCFullYear();

    const balanceBefore = await leaveBalances.getOrInit(
      employeeId,
      leaveTypeId,
      year,
    );
    expect(Number(balanceBefore.pendingDays)).toBe(0);
    expect(Number(balanceBefore.consumedDays)).toBe(0);

    const submitted = await leaveRequests.submit({
      employeeId,
      leaveTypeId,
      startDate: toDateOnly(start),
      endDate: toDateOnly(end),
      reason: 'Integration test leave',
    });
    expect(submitted.status).toBe('pending');
    expect(Number(submitted.totalDays)).toBeGreaterThan(0);
    const totalDays = Number(submitted.totalDays);

    const balanceAfterSubmit = await leaveBalances.getOrInit(
      employeeId,
      leaveTypeId,
      year,
    );
    expect(Number(balanceAfterSubmit.pendingDays)).toBe(totalDays);
    expect(Number(balanceAfterSubmit.consumedDays)).toBe(0);

    // Level 1: hr_officer
    const afterLevel1 = await leaveApprovals.approve(
      submitted.id,
      randomUUID(),
      ['hr_officer'],
      'Looks good',
    );
    expect(afterLevel1.status).toBe('pending');
    expect(afterLevel1.currentApprovalLevel).toBe(2);

    // Level 2 (final): principal
    const afterLevel2 = await leaveApprovals.approve(
      submitted.id,
      randomUUID(),
      ['principal'],
      'Approved',
    );
    expect(afterLevel2.status).toBe('approved');

    const balanceAfterApproval = await leaveBalances.getOrInit(
      employeeId,
      leaveTypeId,
      year,
    );
    expect(Number(balanceAfterApproval.pendingDays)).toBe(0);
    expect(Number(balanceAfterApproval.consumedDays)).toBe(totalDays);

    const attendanceRows = await prisma.hrAttendance.findMany({
      where: {
        employeeId,
        attendanceDate: { gte: start, lte: end },
        status: 'leave',
      },
    });
    expect(attendanceRows.length).toBe(totalDays);
  });
});
