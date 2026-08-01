import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import {
  SUPPLY_ACTOR_ID,
  seedConsumableItem,
  seedMainStore,
  seedOpeningStock,
} from './helpers/supply-chain.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** ST-01 — stock_movements is append-only for the application DB role. */
describeIfDb('Stock movements append-only integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let movementId: string;

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

    const item = await seedConsumableItem(prisma);
    const location = await seedMainStore(prisma);
    const movement = await seedOpeningStock(
      app,
      item.id,
      location.id,
      3,
      100_00,
    );
    movementId = movement.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  async function withAppRole<T>(fn: (client: PrismaClient) => Promise<T>) {
    const url = process.env.DATABASE_APP_URL ?? process.env.DATABASE_URL!;
    const client = new PrismaClient({ datasources: { db: { url } } });
    try {
      if (!process.env.DATABASE_APP_URL) {
        await client.$executeRawUnsafe(`SET ROLE sserp_app`);
      }
      return await fn(client);
    } finally {
      await client.$disconnect();
    }
  }

  async function expectPermissionDenied(promise: Promise<unknown>) {
    try {
      await promise;
      throw new Error('Expected permission denied');
    } catch (e) {
      if (e instanceof Error && e.message === 'Expected permission denied') {
        throw e;
      }
      expect(String(e)).toMatch(
        /permission denied|42501|insufficient privilege/i,
      );
    }
  }

  it('denies UPDATE on stock_movements for sserp_app', async () => {
    await withAppRole(async (client) => {
      await expectPermissionDenied(
        client.$executeRawUnsafe(
          `UPDATE stock_movements SET quantity = 0 WHERE id = '${movementId}'::uuid`,
        ),
      );
    });

    const row = await prisma.stockMovement.findUniqueOrThrow({
      where: { id: movementId },
    });
    expect(Number(row.quantity)).toBe(3);
  });

  it('denies DELETE on stock_movements for sserp_app', async () => {
    await withAppRole(async (client) => {
      await expectPermissionDenied(
        client.$executeRawUnsafe(
          `DELETE FROM stock_movements WHERE id = '${movementId}'::uuid`,
        ),
      );
    });

    const row = await prisma.stockMovement.findUnique({
      where: { id: movementId },
    });
    expect(row).toBeTruthy();
  });
});
