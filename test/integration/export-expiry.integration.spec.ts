import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { ExportCleanupJob } from '../../src/modules/reports/jobs/export-cleanup.job';
import { createReportsTestApp } from './helpers/reports.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** RP-09 — expired export jobs are cleaned up. */
describeIfDb('Export expiry integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createReportsTestApp();
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('marks past-retention jobs expired and clears object key', async () => {
    const prisma = app.get(PrismaService);
    const past = new Date(Date.now() - 48 * 3600_000);
    const job = await prisma.exportJob.create({
      data: {
        reportCode: 'finance.pnl',
        requestedBy: '00000000-0000-4000-8000-000000000002',
        parameters: {},
        format: 'xlsx',
        status: 'completed',
        objectKey: 'exports/test-expired.xlsx',
        queuedAt: past,
        completedAt: past,
        expiresAt: past,
      },
    });

    const cleanup = app.get(ExportCleanupJob);
    await cleanup.handle();

    const refreshed = await prisma.exportJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(refreshed.status).toBe('expired');
  }, 60000);
});
