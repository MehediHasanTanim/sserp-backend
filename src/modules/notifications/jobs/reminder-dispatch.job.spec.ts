import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReminderDispatchJob } from './reminder-dispatch.job';
import { EventNames } from '../../../shared/events/event-names';

describe('ReminderDispatchJob', () => {
  const emitAsync = jest.fn();
  const events = { emitAsync } as unknown as EventEmitter2;

  beforeEach(() => {
    emitAsync.mockReset();
  });

  it('emits admission_fee.pending for pending fees on target invoice date', async () => {
    const prisma = {
      admissionFee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'fee1',
            studentId: 'stu1',
            invoiceDate: new Date('2026-08-08T00:00:00Z'),
          },
        ]),
      },
      reminderSchedule: { findMany: jest.fn() },
    } as any;
    const job = new ReminderDispatchJob(prisma, events);
    const n = await job.dispatchSchedule(
      EventNames.ADMISSION_FEE_PENDING,
      -7,
      'admission_fee.pending.7d',
      new Date('2026-08-01T12:00:00Z'),
    );
    expect(n).toBe(1);
    expect(emitAsync).toHaveBeenCalledWith(
      EventNames.ADMISSION_FEE_PENDING,
      expect.objectContaining({ studentId: 'stu1', admissionFeeId: 'fee1' }),
    );
  });

  it('emits iep.review_due for active plans with matching nextReviewDate', async () => {
    const prisma = {
      iepPlan: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'iep1',
            studentId: 'stu1',
            nextReviewDate: new Date('2026-08-15T00:00:00Z'),
          },
        ]),
      },
      reminderSchedule: { findMany: jest.fn() },
    } as any;
    const job = new ReminderDispatchJob(prisma, events);
    const n = await job.dispatchSchedule(
      EventNames.IEP_REVIEW_DUE,
      -14,
      'iep.review_due.14d',
      new Date('2026-08-01T12:00:00Z'),
    );
    expect(n).toBe(1);
    expect(emitAsync).toHaveBeenCalledWith(
      EventNames.IEP_REVIEW_DUE,
      expect.objectContaining({ iepId: 'iep1' }),
    );
  });

  it('emits activity.fee_unpaid for pending enrollments before activity date', async () => {
    const prisma = {
      activityEnrollment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'enr1',
            studentId: 'stu1',
            activity: {
              id: 'act1',
              name: 'Trip',
              activityDate: new Date('2026-08-04T00:00:00Z'),
            },
          },
        ]),
      },
      reminderSchedule: { findMany: jest.fn() },
    } as any;
    const job = new ReminderDispatchJob(prisma, events);
    const n = await job.dispatchSchedule(
      EventNames.ACTIVITY_FEE_UNPAID,
      -3,
      'activity.fee_unpaid.3d',
      new Date('2026-08-01T12:00:00Z'),
    );
    expect(n).toBe(1);
    expect(emitAsync).toHaveBeenCalledWith(
      EventNames.ACTIVITY_FEE_UNPAID,
      expect.objectContaining({ enrollmentId: 'enr1' }),
    );
  });
});
