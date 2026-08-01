/**
 * Notification pipeline — persist before dispatch (NT-01) and dedup (NT-13).
 */
import { NotificationsService } from '../../src/modules/notifications/services/notification.service';
import { ChannelRouterService } from '../../src/modules/notifications/services/channel-router.service';

describe('Notification pipeline (NT-01/NT-13)', () => {
  it('skips inactive users without creating a row', async () => {
    const create = jest.fn();
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          isActive: false,
          deletedAt: null,
          email: 'a@test.com',
        }),
      },
      notification: { create },
      notificationType: { findUnique: jest.fn() },
      organizationSettings: { findUniqueOrThrow: jest.fn() },
    };
    const service = new NotificationsService(
      prisma as never,
      new ChannelRouterService(),
      {} as never,
      {} as never,
      {} as never,
      { emitAsync: jest.fn() } as never,
      { add: jest.fn() } as never,
      { add: jest.fn() } as never,
      undefined,
    );
    const result = await service.createAndDispatch({
      userId: 'u1',
      typeCode: 'fee.overdue',
      title: 't',
      body: 'b',
    });
    expect(result.skipped).toBe('inactive_user');
    expect(create).not.toHaveBeenCalled();
  });

  it('dedupes on groupKey within window', async () => {
    const existing = { id: 'n-existing' };
    const create = jest.fn();
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          isActive: true,
          deletedAt: null,
          email: 'a@test.com',
        }),
      },
      notificationType: {
        findUnique: jest.fn().mockResolvedValue({
          code: 'inventory.stock.low',
          isActive: true,
          priority: 'normal',
          supportsDigest: true,
          defaultChannels: ['in_app'],
          allowedChannels: ['in_app', 'email'],
        }),
      },
      organizationSettings: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          notificationDedupWindowSeconds: 300,
          emailEnabled: true,
          smsEnabled: true,
        }),
      },
      notification: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create,
      },
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
      suppressionList: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new NotificationsService(
      prisma as never,
      new ChannelRouterService(),
      {} as never,
      {} as never,
      {} as never,
      { emitAsync: jest.fn() } as never,
      { add: jest.fn() } as never,
      { add: jest.fn() } as never,
      undefined,
    );
    const result = await service.createAndDispatch({
      userId: 'u1',
      typeCode: 'inventory.stock.low',
      title: 'Low stock',
      body: 'Item low',
      groupKey: 'stock:item1:loc1',
    });
    expect(result.skipped).toBe('deduped');
    expect(create).not.toHaveBeenCalled();
  });
});
