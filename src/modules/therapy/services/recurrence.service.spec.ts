import { RecurrenceService } from './recurrence.service';

describe('RecurrenceService - expandDates', () => {
  let service: RecurrenceService;
  let prisma: any;
  let conflictDetection: any;
  let sessionService: any;

  beforeEach(() => {
    prisma = {
      therapyRecurrence: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      therapySession: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
    };
    conflictDetection = { check: jest.fn().mockResolvedValue({ blocking: [], warnings: [] }) };
    sessionService = { schedule: jest.fn().mockResolvedValue({ id: 'sess1' }) };
    service = new RecurrenceService(prisma, conflictDetection, sessionService);
  });

  describe('expandDates (via private method access)', () => {
    function makeRecurrence(pattern: any, dayOfWeek?: number, dayOfMonth?: number) {
      return {
        recurrencePattern: pattern,
        startDate: new Date('2026-01-05'),
        endDate: null,
        dayOfWeek: dayOfWeek ?? null,
        dayOfMonth: dayOfMonth ?? null,
      };
    }

    it('R-01: weekly pattern should only generate dates on the correct day', () => {
      const rec = makeRecurrence('weekly', 1); // Monday=1
      const from = new Date('2026-01-05');
      const until = new Date('2026-01-26');
      const dates = (service as any).expandDates(rec, from, until);
      expect(dates.length).toBeGreaterThan(0);
      dates.forEach((d: Date) => expect(d.getUTCDay()).toBe(1));
    });

    it('R-02: biweekly pattern should generate every 2 weeks', () => {
      const rec = makeRecurrence('biweekly', 1);
      const from = new Date('2026-01-05');
      const until = new Date('2026-02-20');
      const dates = (service as any).expandDates(rec, from, until);
      expect(dates.length).toBeGreaterThan(1);
      const diff = (dates[1].getTime() - dates[0].getTime()) / (7 * 86400000);
      expect(diff).toBe(2);
    });

    it('R-03: monthly pattern should generate on correct day of month', () => {
      const rec = makeRecurrence('monthly', undefined, 15);
      const from = new Date('2026-01-01');
      const until = new Date('2026-04-01');
      const dates = (service as any).expandDates(rec, from, until);
      dates.forEach((d: Date) => expect(d.getUTCDate()).toBe(15));
    });

    it('R-04: DST boundary - week-stradding dates should be on same wall-clock day', () => {
      // March 2026: DST transition. Weekly on Monday
      const rec = makeRecurrence('weekly', 1);
      rec.startDate = new Date('2026-03-02');
      const from = new Date('2026-03-02');
      const until = new Date('2026-03-30');
      const dates = (service as any).expandDates(rec, from, until);
      dates.forEach((d: Date) => expect(d.getUTCDay()).toBe(1));
    });
  });

  describe('materialiseRange', () => {
    it('R-05: should skip conflicting dates when strict=false', async () => {
      conflictDetection.check.mockResolvedValue({ blocking: [{ type: 'therapist_double_booking', message: 'conflict' }], warnings: [] });
      prisma.therapyRecurrence.findUnique.mockResolvedValue({
        id: 'rec1',
        status: 'active',
        sessionMode: 'individual',
        therapistId: 'th1',
        patientId: 'p1',
        groupId: null,
        therapyType: 'ot',
        recurrencePattern: 'weekly',
        dayOfWeek: 1,
        dayOfMonth: null,
        startTime: new Date('2026-01-05T09:00:00Z'),
        durationMinutes: 60,
        room: null,
        startDate: new Date('2026-01-05'),
        endDate: null,
      });

      const result = await service.materialiseRange('rec1', new Date('2026-01-05'), new Date('2026-01-26'), false, 'sys');
      expect(result.skipped.length).toBeGreaterThan(0);
      expect(sessionService.schedule).not.toHaveBeenCalled();
    });

    it('R-06: strict mode should throw on first conflict', async () => {
      conflictDetection.check.mockResolvedValue({ blocking: [{ message: 'conflict' }], warnings: [] });
      prisma.therapyRecurrence.findUnique.mockResolvedValue({
        id: 'rec1',
        status: 'active',
        sessionMode: 'individual',
        therapistId: 'th1',
        patientId: 'p1',
        groupId: null,
        therapyType: 'ot',
        recurrencePattern: 'weekly',
        dayOfWeek: 1,
        dayOfMonth: null,
        startTime: new Date('2026-01-05T09:00:00Z'),
        durationMinutes: 60,
        room: null,
        startDate: new Date('2026-01-05'),
        endDate: null,
      });

      await expect(
        service.materialiseRange('rec1', new Date('2026-01-05'), new Date('2026-01-26'), true, 'sys'),
      ).rejects.toThrow('conflict');
    });
  });
});
