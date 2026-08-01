/**
 * Delivery log / retry / suppression (NT-09/NT-10).
 */
import { DeliveryLogService } from '../../src/modules/notifications/services/delivery-log.service';

describe('Delivery log (NT-10)', () => {
  it('records suppressed delivery without failed status', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'd1',
      status: 'suppressed',
    });
    const prisma = {
      notificationDelivery: { create },
    };
    const service = new DeliveryLogService(
      prisma as never,
      { emitAsync: jest.fn() } as never,
    );
    await service.recordSuppressed('n1', 'email', 'bounce@test.com');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'suppressed',
        }),
      }),
    );
  });
});
