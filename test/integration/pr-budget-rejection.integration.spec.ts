import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { PurchaseRequestService } from '../../src/modules/procurement/services/purchase-request.service';
import { PrApprovalService } from '../../src/modules/procurement/services/pr-approval.service';
import { ErrorCode } from '../../src/shared/errors/domain-exception';
import {
  COORDINATOR_ACTOR_ID,
  PRINCIPAL_ACTOR_ID,
  SUPPLY_ACTOR_ID,
  expectDomainCode,
  seedConsumableItem,
  seedTightBudgetLine,
} from './helpers/supply-chain.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** PR-04 / PRO-E2E-02 — budget block prevents approval; rejection leaves no PO. */
describeIfDb('PR budget rejection integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let prs: PurchaseRequestService;
  let approvals: PrApprovalService;

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
    prs = app.get(PurchaseRequestService);
    approvals = app.get(PrApprovalService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('blocks principal approval over budget and rejection leaves stock unchanged', async () => {
    const budgetLine = await seedTightBudgetLine(prisma, 50_00);
    const item = await seedConsumableItem(prisma);
    const uom = await prisma.unitOfMeasure.findFirstOrThrow({
      where: { code: 'EA' },
    });

    const levelBefore = await prisma.stockLevel.findFirst({
      where: { itemId: item.id },
    });
    const onHandBefore = Number(levelBefore?.quantityOnHand ?? 0);

    const pr = await prs.create(
      {
        budgetLineId: budgetLine.id,
        justification: 'Over-budget integration PR',
        lines: [
          {
            itemId: item.id,
            itemDescription: item.name,
            quantity: 10,
            unitOfMeasureId: uom.id,
            estimatedUnitCost: 100_00,
          },
        ],
      },
      SUPPLY_ACTOR_ID,
    );
    await prs.submit(pr.id, SUPPLY_ACTOR_ID);
    await approvals.deptReview(pr.id, COORDINATOR_ACTOR_ID, ['coordinator'], {
      approved: true,
      comment: 'Dept OK',
    });

    await expectDomainCode(
      () =>
        approvals.approve(pr.id, PRINCIPAL_ACTOR_ID, ['principal'], {
          comment: 'Should fail',
        }),
      ErrorCode.BUDGET_EXCEEDED,
    );

    const dryRun = await approvals.dryRunBudgetCheck(pr.id);
    expect(dryRun.ok).toBe(false);

    const rejected = await approvals.reject(
      pr.id,
      PRINCIPAL_ACTOR_ID,
      ['principal'],
      'Exceeds available budget for this period',
    );
    expect(rejected.status).toBe('rejected');

    const poCount = await prisma.purchaseOrder.count({
      where: {
        lines: { some: { purchaseRequestLine: { prId: pr.id } } },
      },
    });
    expect(poCount).toBe(0);

    const levelAfter = await prisma.stockLevel.findFirst({
      where: { itemId: item.id },
    });
    expect(Number(levelAfter?.quantityOnHand ?? 0)).toBe(onHandBefore);
  }, 120000);
});
