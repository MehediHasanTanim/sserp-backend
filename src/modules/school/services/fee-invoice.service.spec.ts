import { FeeInvoiceService } from './fee-invoice.service';

describe('FeeInvoiceService', () => {
  describe('computeAmount (F-03) — table-driven, paisa-exact', () => {
    let service: FeeInvoiceService;

    beforeEach(() => {
      service = new FeeInvoiceService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
    });

    const H1 = 'head-tuition';
    const H2 = 'head-transport';

    const cases: Array<{
      name: string;
      lines: { feeHeadId: string; amount: number }[];
      discounts: {
        discountType: 'percentage' | 'fixed';
        value: number;
        feeHeadId?: string | null;
      }[];
      scholarships: { coverageType: 'percentage' | 'fixed'; value: number }[];
      expected: {
        grossAmount: number;
        discountAmount: number;
        netAmount: number;
      };
    }> = [
      {
        name: '1. single head, no discount, no scholarship',
        lines: [{ feeHeadId: H1, amount: 5000 }],
        discounts: [],
        scholarships: [],
        expected: { grossAmount: 5000, discountAmount: 0, netAmount: 5000 },
      },
      {
        name: '2. multiple heads, no discount',
        lines: [
          { feeHeadId: H1, amount: 3000 },
          { feeHeadId: H2, amount: 2000 },
        ],
        discounts: [],
        scholarships: [],
        expected: { grossAmount: 5000, discountAmount: 0, netAmount: 5000 },
      },
      {
        name: '3. single head + 10% blanket discount',
        lines: [{ feeHeadId: H1, amount: 5000 }],
        discounts: [{ discountType: 'percentage', value: 10 }],
        scholarships: [],
        expected: { grossAmount: 5000, discountAmount: 500, netAmount: 4500 },
      },
      {
        name: '4. single head + fixed discount',
        lines: [{ feeHeadId: H1, amount: 5000 }],
        discounts: [{ discountType: 'fixed', value: 1000 }],
        scholarships: [],
        expected: { grossAmount: 5000, discountAmount: 1000, netAmount: 4000 },
      },
      {
        name: '5. multiple heads + per-head discount (one head only)',
        lines: [
          { feeHeadId: H1, amount: 3000 },
          { feeHeadId: H2, amount: 2000 },
        ],
        discounts: [{ discountType: 'percentage', value: 10, feeHeadId: H1 }],
        scholarships: [],
        expected: { grossAmount: 5000, discountAmount: 300, netAmount: 4700 },
      },
      {
        name: '6. multiple heads + blanket percentage discount applied per line',
        lines: [
          { feeHeadId: H1, amount: 3000 },
          { feeHeadId: H2, amount: 2000 },
        ],
        discounts: [{ discountType: 'percentage', value: 20 }],
        scholarships: [],
        expected: { grossAmount: 5000, discountAmount: 1000, netAmount: 4000 },
      },
      {
        name: '7. percentage discount + percentage scholarship stacked',
        lines: [{ feeHeadId: H1, amount: 10000 }],
        discounts: [{ discountType: 'percentage', value: 10 }],
        scholarships: [{ coverageType: 'percentage', value: 50 }],
        expected: { grossAmount: 10000, discountAmount: 5500, netAmount: 4500 },
      },
      {
        name: '8. fixed discount exceeding the line amount is capped',
        lines: [{ feeHeadId: H1, amount: 2000 }],
        discounts: [{ discountType: 'fixed', value: 5000 }],
        scholarships: [],
        expected: { grossAmount: 2000, discountAmount: 2000, netAmount: 0 },
      },
      {
        name: '9. fixed scholarship exceeding the remaining balance is capped',
        lines: [{ feeHeadId: H1, amount: 5000 }],
        discounts: [],
        scholarships: [{ coverageType: 'fixed', value: 10000 }],
        expected: { grossAmount: 5000, discountAmount: 5000, netAmount: 0 },
      },
      {
        name: '10. two stacked discounts on the same line (fixed then percentage)',
        lines: [{ feeHeadId: H1, amount: 10000 }],
        discounts: [
          { discountType: 'fixed', value: 2000 },
          { discountType: 'percentage', value: 10 },
        ],
        scholarships: [],
        expected: { grossAmount: 10000, discountAmount: 3000, netAmount: 7000 },
      },
    ];

    it.each(cases)('$name', ({ lines, discounts, scholarships, expected }) => {
      const result = service.computeAmount(lines, discounts, scholarships);
      expect(result.grossAmount).toBe(expected.grossAmount);
      expect(result.discountAmount).toBe(expected.discountAmount);
      expect(result.netAmount).toBe(expected.netAmount);
      expect(result.grossAmount - result.discountAmount).toBe(result.netAmount);
    });
  });

  describe('generateMonthly (F-01/F-02/F-08/F-11)', () => {
    let prisma: {
      organizationSettings: { findFirst: jest.Mock };
      student: { findMany: jest.Mock };
      feeInvoice: { findFirst: jest.Mock; create: jest.Mock };
      feeInvoiceLine: { create: jest.Mock };
      $transaction: jest.Mock;
    };
    let numbering: { nextCode: jest.Mock };
    let events: { emitAsync: jest.Mock };
    let ledger: { post: jest.Mock };
    let feeStructures: {
      currentFeeCategory: jest.Mock;
      applicableStructures: jest.Mock;
      approvedDiscountsFor: jest.Mock;
      activeScholarshipsFor: jest.Mock;
    };
    let service: FeeInvoiceService;

    const activeStudent = { id: 'stu-active', status: 'active' };
    const leaveStudent = { id: 'stu-leave', status: 'on_leave' };
    const alreadyInvoicedStudent = { id: 'stu-invoiced', status: 'active' };

    beforeEach(() => {
      prisma = {
        organizationSettings: {
          findFirst: jest.fn().mockResolvedValue({ feeDueDayOfMonth: 10 }),
        },
        student: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              activeStudent,
              leaveStudent,
              alreadyInvoicedStudent,
            ]),
        },
        feeInvoice: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.studentId === alreadyInvoicedStudent.id) {
              return Promise.resolve({ id: 'existing-invoice' });
            }
            return Promise.resolve(null);
          }),
          create: jest.fn().mockResolvedValue({
            id: 'invoice1',
            invoiceNumber: 'INV-000001',
            netAmount: 5000,
          }),
        },
        feeInvoiceLine: { create: jest.fn() },
        $transaction: jest.fn((fn) => fn(prisma)),
      };
      numbering = { nextCode: jest.fn().mockResolvedValue('INV-000001') };
      events = { emitAsync: jest.fn().mockResolvedValue(undefined) };
      ledger = { post: jest.fn().mockResolvedValue({ deferred: true }) };
      feeStructures = {
        currentFeeCategory: jest
          .fn()
          .mockResolvedValue({ feeCategoryId: 'cat1' }),
        applicableStructures: jest
          .fn()
          .mockResolvedValue([
            { feeHeadId: 'head1', amount: 5000, feeHead: { name: 'Tuition' } },
          ]),
        approvedDiscountsFor: jest.fn().mockResolvedValue([]),
        activeScholarshipsFor: jest.fn().mockResolvedValue([]),
      };
      service = new FeeInvoiceService(
        prisma as never,
        numbering as never,
        events as never,
        ledger as never,
        feeStructures as never,
      );
    });

    it('generates invoices only for active students, skips others with reasons', async () => {
      const result = await service.generateMonthly(
        { academicYearId: 'ay1', month: 1, year: 2025 },
        'actor1',
      );

      expect(result.generated).toBe(1);
      expect(result.skipped).toEqual(
        expect.arrayContaining([
          { studentId: leaveStudent.id, reason: 'not_active:on_leave' },
          { studentId: alreadyInvoicedStudent.id, reason: 'already_generated' },
        ]),
      );
      expect(numbering.nextCode).toHaveBeenCalledTimes(1);
      expect(ledger.post).toHaveBeenCalledTimes(1);
      expect(ledger.post).toHaveBeenCalledWith(
        expect.objectContaining({
          debitAccountCode: '1200',
          creditAccountCode: '4002',
        }),
      );
      expect(events.emitAsync).toHaveBeenCalledWith(
        'fee.invoice.generated',
        expect.objectContaining({ studentId: activeStudent.id }),
      );
    });

    it('is idempotent: re-running generates nothing new once all invoices exist', async () => {
      prisma.feeInvoice.findFirst.mockResolvedValue({ id: 'existing' });

      const result = await service.generateMonthly(
        { academicYearId: 'ay1', month: 1, year: 2025 },
        'actor1',
      );

      expect(result.generated).toBe(0);
      expect(ledger.post).not.toHaveBeenCalled();
    });

    it('skips a student with no fee category assignment', async () => {
      prisma.student.findMany.mockResolvedValue([activeStudent]);
      feeStructures.currentFeeCategory.mockResolvedValue(null);

      const result = await service.generateMonthly(
        { academicYearId: 'ay1', month: 1, year: 2025 },
        'actor1',
      );

      expect(result.generated).toBe(0);
      expect(result.skipped).toEqual([
        { studentId: activeStudent.id, reason: 'no_fee_category' },
      ]);
    });

    it('skips a student with no applicable fee structure', async () => {
      prisma.student.findMany.mockResolvedValue([activeStudent]);
      feeStructures.applicableStructures.mockResolvedValue([]);

      const result = await service.generateMonthly(
        { academicYearId: 'ay1', month: 1, year: 2025 },
        'actor1',
      );

      expect(result.generated).toBe(0);
      expect(result.skipped).toEqual([
        { studentId: activeStudent.id, reason: 'no_fee_structure' },
      ]);
    });
  });

  describe('cancel (F-12)', () => {
    let prisma: {
      feeInvoice: { findUnique: jest.Mock; update: jest.Mock };
    };
    let service: FeeInvoiceService;

    beforeEach(() => {
      prisma = {
        feeInvoice: { findUnique: jest.fn(), update: jest.fn() },
      };
      service = new FeeInvoiceService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
    });

    it('cancels an invoice with no payments', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue({
        id: 'inv1',
        paidAmount: 0,
        status: 'issued',
      });
      prisma.feeInvoice.update.mockResolvedValue({
        id: 'inv1',
        status: 'cancelled',
      });

      const result = await service.cancel('inv1', { reason: 'duplicate' });
      expect(result.status).toBe('cancelled');
    });

    it('rejects cancellation when the invoice already has payments', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue({
        id: 'inv1',
        paidAmount: 2000,
        status: 'partially_paid',
      });

      await expect(
        service.cancel('inv1', { reason: 'duplicate' }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'INVOICE_HAS_PAYMENTS',
      });
    });
  });
});
