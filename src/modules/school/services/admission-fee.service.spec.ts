import { AdmissionFeeService } from './admission-fee.service';

describe('AdmissionFeeService', () => {
  let tx: {
    admissionFee: { findUnique: jest.Mock; update: jest.Mock };
    student: { findFirst: jest.Mock };
  };
  let prisma: { $transaction: jest.Mock };
  let numbering: { nextCode: jest.Mock };
  let events: { emitAsync: jest.Mock };
  let ledger: { post: jest.Mock };
  let studentStatus: { changeStatus: jest.Mock };
  let service: AdmissionFeeService;

  const pendingFee = {
    id: 'fee1',
    studentId: 'stu1',
    amount: 5000,
    status: 'pending',
  };
  const pendingStudent = { id: 'stu1', status: 'pending_admission_fee' };

  beforeEach(() => {
    tx = {
      admissionFee: {
        findUnique: jest.fn().mockResolvedValue({ ...pendingFee }),
        update: jest.fn().mockImplementation(({ data }) => ({
          ...pendingFee,
          ...data,
        })),
      },
      student: {
        findFirst: jest.fn().mockResolvedValue({ ...pendingStudent }),
      },
    };
    prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    numbering = { nextCode: jest.fn().mockResolvedValue('RCT-000001') };
    events = { emitAsync: jest.fn().mockResolvedValue(undefined) };
    ledger = { post: jest.fn().mockResolvedValue({ deferred: true }) };
    studentStatus = {
      changeStatus: jest
        .fn()
        .mockResolvedValue({ id: 'stu1', status: 'active' }),
    };
    service = new AdmissionFeeService(
      prisma as never,
      numbering as never,
      events as never,
      ledger as never,
      studentStatus as never,
    );
  });

  describe('pay', () => {
    it('activates the student, emits admission_fee.paid, and posts once', async () => {
      const result = await service.pay(
        'stu1',
        { amount: 5000, paymentMethod: 'cash' },
        'actor1',
      );

      expect(result.status).toBe('paid');
      expect(result.receiptNumber).toBe('RCT-000001');
      expect(studentStatus.changeStatus).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: 'stu1', toStatus: 'active' }),
        tx,
      );
      expect(ledger.post).toHaveBeenCalledTimes(1);
      expect(ledger.post).toHaveBeenCalledWith(
        expect.objectContaining({
          debitAccountCode: '1010',
          creditAccountCode: '1200',
        }),
      );
      expect(events.emitAsync).toHaveBeenCalledWith(
        'admission_fee.paid',
        expect.objectContaining({ studentId: 'stu1', amount: 5000 }),
      );
    });

    it('routes bank payments to the bank account code', async () => {
      await service.pay(
        'stu1',
        { amount: 5000, paymentMethod: 'bank_transfer' },
        'actor1',
      );
      expect(ledger.post).toHaveBeenCalledWith(
        expect.objectContaining({ debitAccountCode: '1020' }),
      );
    });

    it('rejects payment on an already-active student', async () => {
      tx.student.findFirst.mockResolvedValue({ id: 'stu1', status: 'active' });
      await expect(
        service.pay('stu1', { amount: 5000, paymentMethod: 'cash' }, 'actor1'),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(ledger.post).not.toHaveBeenCalled();
    });

    it('rejects an amount less than the outstanding fee', async () => {
      await expect(
        service.pay('stu1', { amount: 4000, paymentMethod: 'cash' }, 'actor1'),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'PARTIAL_PAYMENT_NOT_ALLOWED',
      });
    });

    it('rejects an amount greater than the outstanding fee', async () => {
      await expect(
        service.pay('stu1', { amount: 6000, paymentMethod: 'cash' }, 'actor1'),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'PARTIAL_PAYMENT_NOT_ALLOWED',
      });
    });

    it('rejects payment on an already-paid fee', async () => {
      tx.admissionFee.findUnique.mockResolvedValue({
        ...pendingFee,
        status: 'paid',
      });
      await expect(
        service.pay('stu1', { amount: 5000, paymentMethod: 'cash' }, 'actor1'),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('rejects payment on an already-waived fee', async () => {
      tx.admissionFee.findUnique.mockResolvedValue({
        ...pendingFee,
        status: 'waived',
      });
      await expect(
        service.pay('stu1', { amount: 5000, paymentMethod: 'cash' }, 'actor1'),
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('waive', () => {
    it('rejects a waiver from a non-principal role', async () => {
      await expect(
        service.waive('stu1', {
          reason: 'financial hardship',
          actorId: 'u1',
          actorRoles: ['coordinator'],
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects a waiver with no reason', async () => {
      await expect(
        service.waive('stu1', {
          reason: '',
          actorId: 'u1',
          actorRoles: ['principal'],
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('waives, posts a write-off (not a receipt), and activates the student', async () => {
      const result = await service.waive('stu1', {
        reason: 'financial hardship',
        actorId: 'principal1',
        actorRoles: ['principal'],
      });

      expect(result.status).toBe('waived');
      expect(numbering.nextCode).not.toHaveBeenCalled();
      expect(studentStatus.changeStatus).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: 'stu1', toStatus: 'active' }),
        tx,
      );
      expect(ledger.post).toHaveBeenCalledWith(
        expect.objectContaining({
          debitAccountCode: '5090',
          creditAccountCode: '1200',
        }),
      );
      expect(events.emitAsync).toHaveBeenCalledWith(
        'admission_fee.waived',
        expect.objectContaining({
          studentId: 'stu1',
          reason: 'financial hardship',
        }),
      );
    });

    it('rejects a waiver on an already-active student', async () => {
      tx.student.findFirst.mockResolvedValue({ id: 'stu1', status: 'active' });
      await expect(
        service.waive('stu1', {
          reason: 'x',
          actorId: 'principal1',
          actorRoles: ['super_admin'],
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
