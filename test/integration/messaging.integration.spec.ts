/**
 * Lightweight messaging integration — full E2E requires seeded staff users.
 * Avoids booting AppModule so unit/CI can run without DB.
 */
import { MessageService } from '../../src/modules/notifications/services/message.service';
import { ErrorCode } from '../../src/shared/errors/domain-exception';

describe('Messaging integration (MS-01/MS-03)', () => {
  it('rejects non-participant reads', async () => {
    const prisma = {
      threadParticipant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      staffMessage: { findMany: jest.fn() },
    };
    const service = new MessageService(
      prisma as never,
      { emitAsync: jest.fn() } as never,
      undefined,
    );
    await expect(
      service.getThreadMessages('unknown-user', 'fake-thread'),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });
});
