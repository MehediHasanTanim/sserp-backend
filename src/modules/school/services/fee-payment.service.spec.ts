import { FeePaymentService } from './fee-payment.service';

describe('FeePaymentService', () => {
  let prisma: {
    feeInvoice: { findUnique: jest.Mock; update: jest.Mock };
    feePayment: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    feeWaiver: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let numbering: { nextCode: jest.Mock };
  let events: { emitAsync: jest.Mock };
  let ledger: { post: jest.Mock };
  let service: FeePaymentService;

  let invoiceStore: {
    id: string;
    netAmount: number;
    paidAmount: number;
    waivedAmount: number;
    outstandingAmount: number;
    status: string;
    studentId: string;
  };

  function freshInvoice(netAmount = 500) {
    return {
      id: 'inv1',
      netAmount,
      paidAmount: 0,
      waivedAmount: 0,
      outstandingAmount: netAmount,
      status: 'issued',
      studentId: 'stu1',
    };
  }

  beforeEach(() => {
    invoiceStore = freshInvoice(500);
    let receiptSeq = 0;

    prisma = {
      feeInvoice: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve({ ...invoiceStore })),
        update: jest.fn().mockImplementation(({ data }) => {
          invoiceStore = { ...invoiceStore, ...data };
          return Promise.resolve({ ...invoiceStore });
        }),
      },
      feePayment: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: `pay-${++receiptSeq}`, ...data }),
        ),
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ where, data }) => ({
          id: where.id,
          amount: 300,
          method: 'cash',
          invoiceId: 'inv1',
          receiptNumber: 'RCT-000001',
          ...data,
        })),
      },
      feeWaiver: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'waiver1', ...data }),
        ),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    numbering = {
      nextCode: jest.fn().mockImplementation(() => Promise.resolve(`RCT-${++receiptSeq}`)),
    };
    events = { emitAsync: jest.fn().mockResolvedValue(undefined) };
    ledger = { post: jest.fn().mockResolvedValue({ deferred: true }) };
    service = new FeePaymentService(
      prisma as never,
      numbering as never,
      events as never,
      ledger as never,
    );
  });

  describe('pay (F-05/F-06/F-07/F-08/F-11)', () => {
    it('a 300 + 200 partial sequence on a 500 invoice moves partially_paid then paid', async () => {
      const first = await service.pay('inv1', { amount: 300, method: 'cash' }, 'actor1');
      expect(first.amount).toBe(300);
      expect(invoiceStore.status).toBe('partially_paid');
      expect(invoiceStore.outstandingAmount).toBe(200);

      const second = await service.pay('inv1', { amount: 200, method: 'cash' }, 'actor1');
      expect(second.amount).toBe(200);
      expect(invoiceStore.status).toBe('paid');
      expect(invoiceStore.outstandingAmount).toBe(0);

      expect(ledger.post).toHaveBeenCalledTimes(2);
      expect(events.emitAsync).toHaveBeenCalledWith(
        'fee.payment.received',
        expect.objectContaining({ invoiceId: 'inv1', amount: 300 }),
      );
    });

    it('rejects an overpayment', async () => {
      await expect(
        service.pay('inv1', { amount: 600, method: 'cash' }, 'actor1'),
      ).rejects.toMatchObject({ statusCode: 422, code: 'OVERPAYMENT' });
      expect(ledger.post).not.toHaveBeenCalled();
    });

    it('rejects payment on a cancelled invoice', async () => {
      invoiceStore = { ...invoiceStore, status: 'cancelled' };
      await expect(
        service.pay('inv1', { amount: 100, method: 'cash' }, 'actor1'),
      ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    });

    it('rejects payment on a waived invoice', async () => {
      invoiceStore = { ...invoiceStore, status: 'waived' };
      await expect(
        service.pay('inv1', { amount: 100, method: 'cash' }, 'actor1'),
      ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    });

    it('posts a balancing debit/credit ledger entry per payment method', async () => {
      await service.pay('inv1', { amount: 100, method: 'bank_transfer' }, 'actor1');
      expect(ledger.post).toHaveBeenCalledWith(
        expect.objectContaining({ debitAccountCode: '1020', creditAccountCode: '1200' }),
      );
    });

    it('allocates a unique receipt number via NumberingService', async () => {
      const payment = await service.pay('inv1', { amount: 100, method: 'cash' }, 'actor1');
      expect(numbering.nextCode).toHaveBeenCalledWith('receipt', expect.anything());
      expect(payment.receiptNumber).toBeDefined();
    });
  });

  describe('reverse (F-09)', () => {
    beforeEach(() => {
      invoiceStore = {
        ...freshInvoice(500),
        paidAmount: 300,
        outstandingAmount: 200,
        status: 'partially_paid',
      };
    });

    it('rejects reversal from a non-accountant/principal role', async () => {
      prisma.feePayment.findUnique.mockResolvedValue({
        id: 'pay1',
        invoiceId: 'inv1',
        amount: 300,
        method: 'cash',
        status: 'recorded',
        receiptNumber: 'RCT-000001',
      });
      await expect(
        service.reverse('pay1', { reason: 'error' }, 'actor1', ['teacher']),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects reversal without a reason', async () => {
      await expect(
        service.reverse('pay1', { reason: '' }, 'actor1', ['accountant']),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('reverses the payment, posts a reversing ledger entry, and keeps the row with status=reversed', async () => {
      prisma.feePayment.findUnique.mockResolvedValue({
        id: 'pay1',
        invoiceId: 'inv1',
        amount: 300,
        method: 'cash',
        status: 'recorded',
        receiptNumber: 'RCT-000001',
      });

      const result = await service.reverse(
        'pay1',
        { reason: 'bounced cheque' },
        'accountant1',
        ['accountant'],
      );

      expect(result.status).toBe('reversed');
      expect(prisma.feePayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'reversed', reversalReason: 'bounced cheque' }),
        }),
      );
      expect(invoiceStore.outstandingAmount).toBe(500);
      expect(invoiceStore.paidAmount).toBe(0);
      expect(ledger.post).toHaveBeenCalledWith(
        expect.objectContaining({ debitAccountCode: '1200', creditAccountCode: '1010' }),
      );
      expect(events.emitAsync).toHaveBeenCalledWith(
        'fee.payment.reversed',
        expect.objectContaining({ paymentId: 'pay1' }),
      );
    });
  });

  describe('waive (F-10)', () => {
    it('rejects a waiver from a non-principal role', async () => {
      await expect(
        service.waive('inv1', { amount: 100, reason: 'hardship' }, 'actor1', ['accountant']),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects a waiver with no reason', async () => {
      await expect(
        service.waive('inv1', { amount: 100, reason: '' }, 'actor1', ['principal']),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('waives part of the outstanding balance and posts a waiver expense entry', async () => {
      const waiver = await service.waive(
        'inv1',
        { amount: 200, reason: 'financial hardship' },
        'principal1',
        ['principal'],
      );
      expect(waiver.amount).toBe(200);
      expect(invoiceStore.waivedAmount).toBe(200);
      expect(invoiceStore.outstandingAmount).toBe(300);
      expect(invoiceStore.status).toBe('partially_paid');
      expect(ledger.post).toHaveBeenCalledWith(
        expect.objectContaining({ debitAccountCode: '5090', creditAccountCode: '1200' }),
      );
      expect(events.emitAsync).toHaveBeenCalledWith(
        'fee.invoice.waived',
        expect.objectContaining({ invoiceId: 'inv1', amount: 200 }),
      );
    });

    it('marks the invoice fully waived when the waiver covers the full outstanding balance', async () => {
      await service.waive(
        'inv1',
        { amount: 500, reason: 'scholarship' },
        'principal1',
        ['principal'],
      );
      expect(invoiceStore.status).toBe('waived');
      expect(invoiceStore.outstandingAmount).toBe(0);
    });

    it('rejects a waiver amount larger than the outstanding balance', async () => {
      await expect(
        service.waive('inv1', { amount: 600, reason: 'x' }, 'principal1', ['principal']),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
