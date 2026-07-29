import { OutboxLedgerAdapter } from './outbox-ledger.adapter';
import { InAppOnlyNotificationAdapter } from './in-app-notification.adapter';

describe('ports', () => {
  it('OutboxLedgerAdapter inserts pending posting', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'p1' });
    const adapter = new OutboxLedgerAdapter({
      pendingLedgerPosting: { create },
    } as never);
    const result = await adapter.post({
      referenceType: 'fee',
      referenceId: 'r1',
      amount: 100,
      costCenter: 'school',
      description: 'test',
      debitAccountCode: '1000',
      creditAccountCode: '4000',
      postingDate: new Date('2026-01-01'),
    });
    expect(result).toEqual({ deferred: true, pendingId: 'p1' });
    expect(create).toHaveBeenCalled();
  });

  it('InAppOnlyNotificationAdapter writes notification row', async () => {
    const create = jest.fn().mockResolvedValue({});
    const adapter = new InAppOnlyNotificationAdapter({
      notification: { create },
    } as never);
    await adapter.notify({
      userId: 'u1',
      type: 'test',
      title: 'Hi',
      body: 'Body',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          channelsRequested: ['in_app'],
        }),
      }),
    );
  });
});
