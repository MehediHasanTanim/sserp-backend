import { execSync } from 'child_process';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import {
  Network,
  GenericContainer,
  StartedNetwork,
  StartedTestContainer,
  Wait,
} from 'testcontainers';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { AppModule } from '../../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { OrgClockService } from '../datetime/org-clock.service';
import { EMAIL_PROVIDER } from '../../modules/notifications/constants';
import {
  EmailProvider,
  EmailSendInput,
  EmailSendResult,
} from '../../modules/notifications/providers/email/email.provider.interface';
import {
  SmsProvider,
  SmsSendInput,
  SmsSendResult,
} from '../../modules/notifications/providers/sms/sms.provider.interface';
import { ConsoleSmsProvider } from '../../modules/notifications/providers/sms/console.provider';
import { SmsProviderFactory } from '../../modules/notifications/providers/sms/sms-provider.factory';

const REFERENCE_TABLES = new Set([
  'roles',
  'permissions',
  'role_permissions',
  'chart_of_accounts',
  'posting_rules',
  'notification_types',
  'organization_settings',
  'numbering_schemes',
  'skill_domains',
  'leave_types',
  '_prisma_migrations',
]);

export class ControllableClock {
  private timezone = 'Asia/Dhaka';
  private frozen: Date | null = null;

  freeze(at: Date) {
    this.frozen = at;
  }

  reset() {
    this.frozen = null;
  }

  async refresh() {
    return;
  }

  getTimezone() {
    return this.timezone;
  }

  nowUtc(): Date {
    return this.frozen ? new Date(this.frozen.getTime()) : new Date();
  }

  toOrgLocal(date: Date): Date {
    return date;
  }

  formatOrg(date: Date, pattern = 'yyyy-MM-dd HH:mm:ss'): string {
    void pattern;
    return date.toISOString();
  }
}

export class InMemoryEmailProvider implements EmailProvider {
  readonly sent: EmailSendInput[] = [];

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    this.sent.push(input);
    return { accepted: true, messageId: `mem-${this.sent.length}` };
  }

  clear() {
    this.sent.length = 0;
  }
}

export class InMemorySmsProvider implements SmsProvider {
  readonly sent: SmsSendInput[] = [];

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    this.sent.push(input);
    return { accepted: true, messageId: `sms-${this.sent.length}` };
  }

  clear() {
    this.sent.length = 0;
  }
}

export interface TestContainers {
  pg: StartedPostgreSqlContainer;
  redis: StartedTestContainer;
  minio: StartedTestContainer;
  network: StartedNetwork;
}

export interface TestContext {
  app: INestApplication;
  moduleRef: TestingModule;
  prisma: PrismaService;
  containers: TestContainers | null;
  clock: ControllableClock;
  email: InMemoryEmailProvider;
  sms: InMemorySmsProvider;
}

let sharedContainers: TestContainers | null = null;
let sharedContext: TestContext | null = null;

function ensureDocker(): void {
  try {
    execSync('docker info', { stdio: 'ignore' });
  } catch {
    throw new Error(
      'Docker daemon is unavailable. Integration tests require Docker (Testcontainers). Start Docker and retry `npm run test:int`.',
    );
  }
}

export async function startContainers(): Promise<TestContainers> {
  if (sharedContainers) return sharedContainers;
  ensureDocker();

  const network = await new Network().start();

  const pg = await new PostgreSqlContainer('postgres:16-alpine')
    .withNetwork(network)
    .withDatabase('sserp_test')
    .withUsername('sserp')
    .withPassword('sserp')
    .start();

  const redis = await new GenericContainer('redis:7-alpine')
    .withNetwork(network)
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .start();

  const minio = await new GenericContainer('minio/minio')
    .withNetwork(network)
    .withCommand(['server', '/data'])
    .withEnvironment({
      MINIO_ROOT_USER: 'minioadmin',
      MINIO_ROOT_PASSWORD: 'minioadmin',
    })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
    .start();

  applyContainerEnv(pg, redis, minio);

  execSync('npx prisma migrate deploy', {
    env: process.env,
    stdio: 'inherit',
  });
  execSync('npx prisma db seed', {
    env: process.env,
    stdio: 'inherit',
  });

  await createMinioBuckets(minio.getHost(), minio.getMappedPort(9000));

  sharedContainers = { pg, redis, minio, network };
  return sharedContainers;
}

function applyContainerEnv(
  pg: StartedPostgreSqlContainer,
  redis: StartedTestContainer,
  minio: StartedTestContainer,
): void {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = pg.getConnectionUri();
  process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  process.env.MINIO_ENDPOINT = minio.getHost();
  process.env.MINIO_PORT = String(minio.getMappedPort(9000));
  process.env.MINIO_ACCESS_KEY = 'minioadmin';
  process.env.MINIO_SECRET_KEY = 'minioadmin';
  process.env.MINIO_USE_SSL = 'false';
  process.env.COOKIE_SECURE = 'false';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
  process.env.BOOTSTRAP_ADMIN_PASSWORD =
    process.env.BOOTSTRAP_ADMIN_PASSWORD || 'ChangeMeNow1';
  process.env.BOOTSTRAP_ADMIN_EMAIL =
    process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@sserp.local';
  process.env.BOOTSTRAP_ADMIN_USERNAME =
    process.env.BOOTSTRAP_ADMIN_USERNAME || 'superadmin';
  process.env.CORS_ORIGINS =
    process.env.CORS_ORIGINS || 'http://localhost:3001';
  process.env.JWT_PRIVATE_KEY_PATH =
    process.env.JWT_PRIVATE_KEY_PATH || './keys/jwt-private.pem';
  process.env.JWT_PUBLIC_KEY_PATH =
    process.env.JWT_PUBLIC_KEY_PATH || './keys/jwt-public.pem';
}

async function createMinioBuckets(host: string, port: number): Promise<void> {
  const { Client } = await import('minio');
  const client = new Client({
    endPoint: host,
    port,
    useSSL: false,
    accessKey: 'minioadmin',
    secretKey: 'minioadmin',
  });
  const buckets = [
    'student-documents',
    'iep-documents',
    'progress-reports',
    'therapy-attachments',
    'hr-documents',
    'invoices-receipts',
    'activity-media',
    'leave-documents',
    'exports',
  ];
  for (const name of buckets) {
    const exists = await client.bucketExists(name).catch(() => false);
    if (!exists) await client.makeBucket(name, '');
  }
}

export async function stopContainers(): Promise<void> {
  if (sharedContext) {
    await sharedContext.app.close().catch(() => undefined);
    sharedContext = null;
  }
  if (!sharedContainers) return;
  const { pg, redis, minio, network } = sharedContainers;
  await Promise.allSettled([pg.stop(), redis.stop(), minio.stop()]);
  await network.stop().catch(() => undefined);
  sharedContainers = null;
}

/**
 * Boots Nest AppModule against Testcontainers (when SSERP_USE_TESTCONTAINERS=1)
 * or against the already-configured DATABASE_URL / CI service containers.
 */
export async function startTestApp(): Promise<TestContext> {
  if (sharedContext) return sharedContext;

  let containers: TestContainers | null = null;
  if (process.env.SSERP_USE_TESTCONTAINERS === '1') {
    containers = await startContainers();
  } else if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required when SSERP_USE_TESTCONTAINERS is not set. Start docker/docker-compose.test.yml or enable Testcontainers.',
    );
  }

  const email = new InMemoryEmailProvider();
  const sms = new InMemorySmsProvider();
  const clock = new ControllableClock();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(EMAIL_PROVIDER)
    .useValue(email)
    .overrideProvider(OrgClockService)
    .useValue(clock)
    .overrideProvider(ConsoleSmsProvider)
    .useValue(sms)
    .overrideProvider(SmsProviderFactory)
    .useValue({ create: () => sms })
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  const prisma = app.get(PrismaService);
  sharedContext = { app, moduleRef, prisma, containers, clock, email, sms };
  return sharedContext;
}

export async function stopTestApp(): Promise<void> {
  if (sharedContext) {
    await sharedContext.app.close().catch(() => undefined);
    sharedContext = null;
  }
  if (process.env.SSERP_USE_TESTCONTAINERS === '1') {
    await stopContainers();
  }
}

/**
 * Truncate all public tables except reference/seed tables.
 */
export async function truncateAllExceptReference(
  prisma: PrismaService,
): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const targets = rows
    .map((r) => r.tablename)
    .filter((t) => !REFERENCE_TABLES.has(t));
  if (!targets.length) return;
  const list = targets.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

export function getSharedTestContext(): TestContext | null {
  return sharedContext;
}

export { REFERENCE_TABLES };
