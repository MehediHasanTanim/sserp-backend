import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from '../../../src/app.module';
import { issueTestToken } from '../../../src/shared/testing/auth.helper';
import { ReportRegistry } from '../../../src/modules/reports/framework/report-registry';

/** Broad read permissions for exercising the full report catalog. */
export const REPORTS_READ_PERMISSIONS = [
  'reports:read',
  'reports:custom',
  'school:read',
  'therapy:read',
  'hr:read',
  'finance:read',
  'inventory:read',
  'procurement:read',
];

export function defaultReportDateRange(): { fromDate: string; toDate: string } {
  const year = new Date().getUTCFullYear();
  return {
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
  };
}

export async function createReportsTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export async function issuePrincipalReportsToken(
  userId = randomUUID(),
): Promise<string> {
  return issueTestToken({
    userId,
    role: 'principal',
    permissions: REPORTS_READ_PERMISSIONS,
  });
}

export async function issueParentToken(userId = randomUUID()): Promise<string> {
  return issueTestToken({
    userId,
    role: 'parent',
    permissions: ['portal:read'],
  });
}

export function listRegisteredReportCodes(app: INestApplication): string[] {
  const registry = app.get(ReportRegistry);
  return registry.list().map((handler) => handler.code);
}

export function reportQueryString(extra: Record<string, string> = {}): string {
  const dates = defaultReportDateRange();
  const params = new URLSearchParams({
    ...dates,
    allowSync: 'true',
    ...extra,
  });
  return params.toString();
}

export function isAcceptableReportStatus(status: number): boolean {
  return status >= 200 && status < 500 && status !== 500;
}
