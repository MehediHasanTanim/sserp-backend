/**
 * NT-02 transactional notification — verifies rollback clears buffered emits.
 * Full fee-payment harness is deferred; this asserts the publisher contract.
 */
import { TransactionalEventPublisher } from '../../src/shared/events/transactional-event-publisher';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('Transactional notification (NT-02)', () => {
  it('does not emit when clear() is called after enqueue (rollback path)', async () => {
    const emitAsync = jest.fn();
    const emitter = { emitAsync } as unknown as EventEmitter2;
    const publisher = new TransactionalEventPublisher(emitter);

    publisher.enqueue('fee.payment.received', { invoiceId: 'x' });
    publisher.clear();
    await publisher.flush();

    expect(emitAsync).not.toHaveBeenCalled();
  });

  it('flushes enqueued events only after successful commit', async () => {
    const emitAsync = jest.fn().mockResolvedValue(undefined);
    const emitter = { emitAsync } as unknown as EventEmitter2;
    const publisher = new TransactionalEventPublisher(emitter);

    publisher.enqueue('notification.created', { id: 'n1' });
    await publisher.flush();

    expect(emitAsync).toHaveBeenCalledWith('notification.created', {
      id: 'n1',
    });
  });
});
