import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { issueTestToken } from '../../src/shared/testing/auth.helper';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { PurchaseRequestService } from '../../src/modules/procurement/services/purchase-request.service';
import { PrApprovalService } from '../../src/modules/procurement/services/pr-approval.service';
import { PurchaseOrderService } from '../../src/modules/procurement/services/purchase-order.service';
import { GrnService } from '../../src/modules/procurement/services/grn.service';
import { ensureOpenFiscalPeriod } from './helpers/payroll.helper';
import {
  COORDINATOR_ACTOR_ID,
  PRINCIPAL_ACTOR_ID,
  SUPPLY_ACTOR_ID,
  seedConsumableItem,
  seedMainStore,
  seedVendor,
} from './helpers/supply-chain.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** PR-02/PO-01/GR-01 — teacher may raise PR but not approve PO or post GRN. */
describeIfDb('Procurement RBAC integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let teacherToken: string;
  let itemId: string;
  let uomId: string;

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

    teacherToken = await issueTestToken({
      userId: randomUUID(),
      role: 'teacher',
      permissions: ['procurement:create', 'procurement:read'],
    });

    const item = await seedConsumableItem(prisma);
    itemId = item.id;
    uomId = item.unitOfMeasureId;
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('teacher can create a purchase request', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/procurement/purchase-requests')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        justification: 'Classroom supplies',
        lines: [
          {
            itemId,
            itemDescription: 'Test item',
            quantity: 2,
            unitOfMeasureId: uomId,
            estimatedUnitCost: 5000,
          },
        ],
      })
      .expect(201);
    expect(res.body.data?.status ?? res.body.status).toBe('draft');
  });

  it('teacher cannot approve a purchase request', async () => {
    const prs = app.get(PurchaseRequestService);
    const approvals = app.get(PrApprovalService);

    const pr = await prs.create(
      {
        justification: 'RBAC pending PR',
        lines: [
          {
            itemId,
            itemDescription: 'Item',
            quantity: 1,
            unitOfMeasureId: uomId,
            estimatedUnitCost: 100_00,
          },
        ],
      },
      SUPPLY_ACTOR_ID,
    );
    await prs.submit(pr.id, SUPPLY_ACTOR_ID);
    await approvals.deptReview(pr.id, COORDINATOR_ACTOR_ID, ['coordinator'], {
      approved: true,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/procurement/purchase-requests/${pr.id}/approve`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ comment: 'Should fail' })
      .expect(403);
  });

  it('teacher cannot create a purchase order', async () => {
    await ensureOpenFiscalPeriod(prisma, 2026, 7);
    const prs = app.get(PurchaseRequestService);
    const approvals = app.get(PrApprovalService);
    const pos = app.get(PurchaseOrderService);
    const vendor = await seedVendor(app);

    const pr = await prs.create(
      {
        justification: 'RBAC PO block',
        lines: [
          {
            itemId,
            itemDescription: 'Item',
            quantity: 1,
            unitOfMeasureId: uomId,
            estimatedUnitCost: 100_00,
          },
        ],
      },
      SUPPLY_ACTOR_ID,
    );
    await prs.submit(pr.id, SUPPLY_ACTOR_ID);
    await approvals.deptReview(pr.id, COORDINATOR_ACTOR_ID, ['coordinator'], {
      approved: true,
    });
    const approved = await approvals.approve(
      pr.id,
      PRINCIPAL_ACTOR_ID,
      ['principal'],
      {},
    );

    await request(app.getHttpServer())
      .post('/api/v1/procurement/purchase-orders')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        vendorId: vendor.id,
        poDate: '2026-07-15',
        lines: [
          {
            prLineId: approved.lines[0].id,
            quantity: 1,
            unitPrice: 100_00,
          },
        ],
      })
      .expect(403);

    expect(pos).toBeDefined();
  });

  it('teacher cannot post a GRN', async () => {
    await ensureOpenFiscalPeriod(prisma, 2026, 7);
    const prs = app.get(PurchaseRequestService);
    const approvals = app.get(PrApprovalService);
    const pos = app.get(PurchaseOrderService);
    const grns = app.get(GrnService);
    const vendor = await seedVendor(app);
    const location = await seedMainStore(prisma);

    const pr = await prs.create(
      {
        justification: 'RBAC GRN block',
        lines: [
          {
            itemId,
            itemDescription: 'Item',
            quantity: 1,
            unitOfMeasureId: uomId,
            estimatedUnitCost: 100_00,
          },
        ],
      },
      SUPPLY_ACTOR_ID,
    );
    await prs.submit(pr.id, SUPPLY_ACTOR_ID);
    await approvals.deptReview(pr.id, COORDINATOR_ACTOR_ID, ['coordinator'], {
      approved: true,
    });
    const approved = await approvals.approve(
      pr.id,
      PRINCIPAL_ACTOR_ID,
      ['principal'],
      {},
    );
    const po = await pos.createFromPrLines(
      {
        vendorId: vendor.id,
        poDate: '2026-07-15',
        lines: [
          {
            prLineId: approved.lines[0].id,
            quantity: 1,
            unitPrice: 100_00,
          },
        ],
      },
      SUPPLY_ACTOR_ID,
    );
    const sent = await pos.send(
      po.status === 'approved'
        ? po.id
        : (await pos.approve(po.id, PRINCIPAL_ACTOR_ID, ['principal'])).id,
    );
    const grn = await grns.create(
      {
        poId: sent.id,
        receiptDate: '2026-07-18',
        receivedAtLocationId: location.id,
        lines: [
          {
            poLineId: sent.lines[0].id,
            receivedQuantity: 1,
            unitCost: 100_00,
          },
        ],
      },
      SUPPLY_ACTOR_ID,
    );
    await grns.qualityCheck(
      grn.id,
      SUPPLY_ACTOR_ID,
      grn.lines.map((l) => ({
        grnLineId: l.id,
        acceptedQuantity: 1,
        rejectedQuantity: 0,
      })),
    );

    await request(app.getHttpServer())
      .post(`/api/v1/procurement/grns/${grn.id}/post`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);
  });
});
