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
      from: process.env.SMTP_FROM,
    },
    sms: {
      provider: process.env.SMS_PROVIDER ?? 'console',
      apiUrl: process.env.SMS_API_URL,
      apiKey: process.env.SMS_API_KEY,
      senderId: process.env.SMS_SENDER_ID,
    },
    smsProvider: process.env.SMS_PROVIDER ?? 'console',
    wsCorsOrigins: (
      process.env.WS_CORS_ORIGINS ??
      process.env.CORS_ORIGINS ??
      'http://localhost:3001'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    redisPubsubUrl: process.env.REDIS_PUBSUB_URL ?? process.env.REDIS_URL,
    sentryDsn: process.env.SENTRY_DSN ?? '',
    fieldEncryptionMasterKey:
      process.env.FIELD_ENCRYPTION_MASTER_KEY ??
      'dev-only-master-key-32bytes-long!!',
    blindIndexKey:
      process.env.BLIND_INDEX_KEY ?? 'dev-only-blind-index-key-32b!!',
    featureBiometric: process.env.FEATURE_BIOMETRIC === 'true',
    featurePaymentGateway: process.env.FEATURE_PAYMENT_GATEWAY === 'true',
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
  smtp: {
    host: string;
    port: number;
    user?: string;
    pass?: string;
    from?: string;
  };
  sms: {
    provider: string;
    apiUrl?: string;
    apiKey?: string;
    senderId?: string;
  };
  smsProvider: string;
  wsCorsOrigins: string[];
  redisPubsubUrl: string;
  sentryDsn: string;
  fieldEncryptionMasterKey: string;
  blindIndexKey: string;
  featureBiometric: boolean;
  featurePaymentGateway: boolean;
  corsOrigins: string[];
  logLevel: string;
  cookieSecure: boolean;
}

export type { EnvConfig };
