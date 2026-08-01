import { BiometricSyncService } from './biometric-sync.service';

describe('BiometricSyncService', () => {
  it('maps device punches to attendance bulkSubmit', async () => {
    const bulkSubmit = jest.fn().mockResolvedValue({ submitted: 1 });
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'emp1', biometricDeviceUserId: 'dev-9' },
        ]),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sys' }),
      },
    };
    const adapter = {
      pollAndSync: jest.fn(),
      fetchPunches: jest.fn().mockResolvedValue([
        {
          deviceUserId: 'dev-9',
          punchedAt: new Date('2026-08-01T03:00:00Z'),
          type: 'in',
        },
        {
          deviceUserId: 'dev-9',
          punchedAt: new Date('2026-08-01T11:00:00Z'),
          type: 'out',
        },
      ]),
    };
    const config = { get: jest.fn().mockReturnValue(true) };
    const svc = new BiometricSyncService(
      prisma as any,
      adapter as any,
      { bulkSubmit } as any,
      config as any,
    );
    const result = await svc.pollAndApply(new Date('2026-08-01T00:00:00Z'));
    expect(result.imported).toBe(1);
    expect(bulkSubmit).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          employeeId: 'emp1',
          attendanceDate: '2026-08-01',
          status: 'present',
        }),
      ],
      'sys',
    );
  });
});
