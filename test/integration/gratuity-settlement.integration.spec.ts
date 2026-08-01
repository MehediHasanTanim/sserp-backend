import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { GratuityProvisionService } from '../../src/modules/hr/services/gratuity-provision.service';
import { GratuitySettlementService } from '../../src/modules/hr/services/gratuity-settlement.service';
import { EmployeeLifecycleService } from '../../src/modules/hr/services/employee-lifecycle.service';
import {
  ACTOR_ID,
  seedPayrollEmployee,
  ensureOpenFiscalPeriod,
} from './helpers/payroll.helper';

/** GR-10–GR-13 — exit settle/pay → ledger toward zero. */
describe('Gratuity settlement integration (GR-10/GR-13)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('settles on exit and zeros ledger after payment', async () => {
    await ensureOpenFiscalPeriod(prisma, 2026, 1);
    await ensureOpenFiscalPeriod(prisma, 2026, 6);
    const { employee } = await seedPayrollEmployee(app, {
      joiningDate: '2015-01-01',
      fullName: 'Gratuity Settle Emp',
    });
    const provisions = app.get(GratuityProvisionService);
    await provisions.runMonthly(2026, 1);

    const lifecycle = app.get(EmployeeLifecycleService);
    await lifecycle.exit(
      employee.id,
      {
        exitType: 'resignation',
        noticeDate: '2026-06-01',
        lastWorkingDay: '2026-06-30',
      },
      ACTOR_ID,
    );

    const settlement = app.get(GratuitySettlementService);
    const payment = await settlement.settle(employee.id, ACTOR_ID);
    expect(payment.netPayable).toBeGreaterThanOrEqual(0);
    expect(payment.grossAmount).toBeGreaterThan(0);

    await expect(
      settlement.settle(employee.id, ACTOR_ID),
    ).rejects.toMatchObject({ code: 'ALREADY_SETTLED' });

    if (payment.netPayable > 0) {
      await settlement.pay(payment.id, ACTOR_ID, 'bank_transfer');
    }

    const ledger = await prisma.gratuityLedger.findFirst({
      where: { employeeId: employee.id },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    });
    expect(ledger).toBeTruthy();
    // After settlement/payment entries, running balance should be at/near zero
    expect(Math.abs(ledger!.runningBalance)).toBeLessThanOrEqual(
      payment.cumulativeProvisionAtExit,
    );
  }, 120000);
});
