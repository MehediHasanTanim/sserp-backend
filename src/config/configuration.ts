import { EnvConfig } from './validation.schema';

export default () =>
  ({
    nodeEnv: process.env.NODE_ENV,
    port: Number(process.env.PORT ?? 3000),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    apiVersion: process.env.API_VERSION ?? '1',
    databaseUrl: process.env.DATABASE_URL,
    databaseAppUrl: process.env.DATABASE_APP_URL,
    redisUrl: process.env.REDIS_URL,
    jwt: {
      privateKeyPath: process.env.JWT_PRIVATE_KEY_PATH,
      publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH,
      accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    },
    bcryptCost: Number(process.env.BCRYPT_COST ?? 12),
    lockout: {
      maxAttempts: Number(process.env.LOCKOUT_MAX_ATTEMPTS ?? 5),
      durationMinutes: Number(process.env.LOCKOUT_DURATION_MINUTES ?? 15),
    },
    minio: {
      endpoint: process.env.MINIO_ENDPOINT,
      port: Number(process.env.MINIO_PORT ?? 9000),
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      presignTtlSeconds: Number(process.env.PRESIGN_TTL_SECONDS ?? 900),
    },
    smtp: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 1025),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    smsProvider: process.env.SMS_PROVIDER ?? 'console',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3001')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    cookieSecure: process.env.COOKIE_SECURE === 'true',
  }) as unknown as AppConfig;

export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  apiVersion: string;
  databaseUrl: string;
  databaseAppUrl?: string;
  redisUrl: string;
  jwt: {
    privateKeyPath: string;
    publicKeyPath: string;
    accessTtl: string;
    refreshTtl: string;
  };
  bcryptCost: number;
  lockout: { maxAttempts: number; durationMinutes: number };
  minio: {
    endpoint: string;
    port: number;
    accessKey: string;
    secretKey: string;
    useSSL: boolean;
    presignTtlSeconds: number;
  };
  smtp: { host: string; port: number; user?: string; pass?: string };
  smsProvider: string;
  corsOrigins: string[];
  logLevel: string;
  cookieSecure: boolean;
}

export type { EnvConfig };
