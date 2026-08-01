import { ReminderScheduleService } from '../../src/modules/notifications/services/reminder-schedule.service';

describe('Reminder schedule (WF-07)', () => {
  it('seeded fee overdue offsets match prior hardcoded days 3/7/15/30', async () => {
    const rows = [
      { reminderCode: 'fee.overdue.3', offsetDays: 3, isActive: true },
      { reminderCode: 'fee.overdue.7', offsetDays: 7, isActive: true },
      { reminderCode: 'fee.overdue.15', offsetDays: 15, isActive: true },
      { reminderCode: 'fee.overdue.30', offsetDays: 30, isActive: true },
    ];
    const prisma = {
      reminderSchedule: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };
    const service = new ReminderScheduleService(prisma as never);
    const schedules = await service.list();
    const fee = schedules.filter((s) =>
      s.reminderCode.startsWith('fee.overdue'),
    );
    expect(fee.map((s) => s.offsetDays).sort((a, b) => a - b)).toEqual([
      3, 7, 15, 30,
    ]);
  });
});
