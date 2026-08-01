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
import {
  ACTOR_ID,
  seedPayrollEmployee,
  ensureOpenFiscalPeriod,
} from './helpers/payroll.helper';

/** GR-06/GR-07 — monthly provision + idempotent re-run. */
describe('Gratuity provision integration (GR-06/GR-07)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisions: GratuityProvisionService;

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
    provisions = app.get(GratuityProvisionService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('provisions eligible employee once; re-run skips duplicate', async () => {
    await ensureOpenFiscalPeriod(prisma, 2026, 6);
    const { employee } = await seedPayrollEmployee(app, {
      joiningDate: '2015-01-01',
      fullName: 'Gratuity Prov Emp',
    });

    const first = await provisions.runMonthly(2026, 6);
    const forEmp = first.results.find((r) => r.employeeId === employee.id);
    expect(forEmp).toBeDefined();
    expect(forEmp!.skipped).toBeFalsy();
    expect(forEmp!.provisionAmount).toBeGreaterThan(0);

    const row = await prisma.gratuityProvision.findUnique({
      where: {
        employeeId_provisionYear_provisionMonth: {
          employeeId: employee.id,
          provisionYear: 2026,
          provisionMonth: 6,
        },
      },
    });
    expect(row).toBeTruthy();
    expect(row!.journalId).toBeTruthy();

    const second = await provisions.runMonthly(2026, 6);
    const again = second.results.find((r) => r.employeeId === employee.id);
    expect(again?.skipped).toBe(true);

    const count = await prisma.gratuityProvision.count({
      where: {
        employeeId: employee.id,
        provisionYear: 2026,
        provisionMonth: 6,
      },
    });
    expect(count).toBe(1);

    const journal = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: row!.journalId! },
    });
    expect(journal.totalDebit).toBe(journal.totalCredit);
  }, 120000);
});
