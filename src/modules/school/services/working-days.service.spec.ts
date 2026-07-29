import { WorkingDaysService } from './working-days.service';

describe('WorkingDaysService', () => {
  let prisma: {
    organizationSettings: { findFirst: jest.Mock };
    holiday: { findMany: jest.Mock };
  };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let service: WorkingDaysService;

  beforeEach(() => {
    prisma = {
      organizationSettings: {
        findFirst: jest.fn().mockResolvedValue({ workingWeek: [5, 6] }),
      },
      holiday: {
        findMany: jest.fn().mockResolvedValue([
          {
            holidayDate: new Date('2026-01-15T00:00:00Z'),
            appliesToDepartments: [],
          },
        ]),
      },
    };
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    service = new WorkingDaysService(prisma as never, cache as never);
  });

  it('excludes weekly off-days and holidays from working-day counts', async () => {
    // 2026-01-01 (Thu) .. 2026-01-17 (Sat): 17 calendar days.
    // Weekly offs: Fri(5)/Sat(6) -> Jan 2,3,9,10,16,17 = 6 days.
    // Holiday: Jan 15 (Thu) = 1 day, not already a weekly off.
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-01-17T00:00:00Z');
    const count = await service.countWorkingDays(start, end);
    expect(count).toBe(17 - 6 - 1);
  });

  it('a holiday applying only to another department does not count for school', async () => {
    prisma.holiday.findMany.mockResolvedValue([
      {
        holidayDate: new Date('2026-01-15T00:00:00Z'),
        appliesToDepartments: ['administration'],
      },
    ]);
    const isHoliday = await service.isHoliday(new Date('2026-01-15T00:00:00Z'));
    expect(isHoliday).toBe(false);
  });

  it('caches holiday keys per year and serves subsequent lookups from cache', async () => {
    await service.getHolidayDateKeysForYear(2026);
    expect(prisma.holiday.findMany).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(
      'holidays:2026',
      expect.any(String),
      expect.any(Number),
    );

    cache.get.mockResolvedValue(JSON.stringify(['2026-01-15']));
    const keys = await service.getHolidayDateKeysForYear(2026);
    expect(keys.has('2026-01-15')).toBe(true);
    // Still only the first, uncached call hit the database.
    expect(prisma.holiday.findMany).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cached year on holiday.changed', async () => {
    await service.handleHolidayChanged({ year: 2026 });
    expect(cache.del).toHaveBeenCalledWith('holidays:2026');
  });
});
