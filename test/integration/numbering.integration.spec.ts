import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { NumberingService } from '../../src/modules/admin/services/organization.service';

describe('Numbering + ports integration', () => {
  let app: INestApplication;

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
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('50 parallel allocations produce distinct gap-free codes', async () => {
    const numbering = app.get(NumberingService);
    const prisma = app.get(PrismaService);
    // Uses a dedicated scheme (not the real `student`/`employee` ones) so
    // this concurrency probe never collides with rows other integration
    // tests (or the demo seed) persist using the production schemes.
    const entityType = 'integration_test_probe';
    await prisma.numberingScheme.upsert({
      where: { entityType },
      create: {
        entityType,
        prefix: 'PRB-',
        padding: 4,
        currentSequence: 0,
        resetPeriod: 'never',
      },
      update: { currentSequence: 0, prefix: 'PRB-', padding: 4 },
    });
    const codes = await Promise.all(
      Array.from({ length: 50 }, () => numbering.nextCode(entityType)),
    );
    expect(new Set(codes).size).toBe(50);
    expect(codes.sort()).toEqual(
      Array.from(
        { length: 50 },
        (_, i) => `PRB-${String(i + 1).padStart(4, '0')}`,
      ),
    );
  });

  it('health ready is 200 when dependencies are up', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
  });
});
