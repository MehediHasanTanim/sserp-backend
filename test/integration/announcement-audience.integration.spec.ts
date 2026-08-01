/**
 * Announcement audience visibility (MS-05/MS-06) — service-level.
 */
import { AnnouncementService } from '../../src/modules/notifications/services/announcement.service';
import { ErrorCode } from '../../src/shared/errors/domain-exception';

describe('Announcement audience (MS-05/MS-06)', () => {
  it('forbids read-stats for non-author non-principal', async () => {
    const prisma = {
      announcement: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'a1',
          createdBy: 'author-1',
          status: 'published',
        }),
      },
      announcementRead: { count: jest.fn(), findMany: jest.fn() },
      user: { findMany: jest.fn() },
    };
    const service = new AnnouncementService(
      prisma as never,
      { emitAsync: jest.fn() } as never,
      {} as never,
      undefined,
    );

    await expect(
      service.readStats('other-user', ['teacher'], 'a1'),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });
});
