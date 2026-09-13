import { z } from 'zod';

const boolish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true');

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('api'),
  API_VERSION: z.string().default('1'),
  DATABASE_URL: z.string().min(1),
  DATABASE_APP_URL: z.string().optional(),
  REDIS_URL: z.string().min(1),
  JWT_PRIVATE_KEY_PATH: z.string().min(1),
  JWT_PUBLIC_KEY_PATH: z.string().min(1),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),
  LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().default(5),
  LOCKOUT_DURATION_MINUTES: z.coerce.number().int().default(15),
  // Cloudflare R2 (preferred). Single bucket; logical folders via object key prefix.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ENDPOINT: z.string().optional(), // override host (tests / custom)
  R2_PORT: z.coerce.number().optional(),
  R2_USE_SSL: boolish,
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional().default(''),
  R2_REGION: z.string().optional().default('auto'),
  R2_PATH_STYLE: boolish,
  // Legacy MinIO (CI / local --profile minio)
  MINIO_ENDPOINT: z.string().optional(),
  MINIO_PORT: z.coerce.number().optional(),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  MINIO_USE_SSL: boolish,
  MINIO_REGION: z.string().optional(),
  PRESIGN_TTL_SECONDS: z.coerce.number().default(900),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default('noreply@sserp.local'),
  SMS_PROVIDER: z.enum(['console', 'ssl_wireless']).default('console'),
  SMS_API_URL: z.string().optional().default(''),
  SMS_API_KEY: z.string().optional().default(''),
  SMS_SENDER_ID: z.string().optional().default(''),
  WS_CORS_ORIGINS: z.string().optional(),
  REDIS_PUBSUB_URL: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:3001'),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  BOOTSTRAP_ADMIN_USERNAME: z.string().optional(),
  SENTRY_DSN: z.string().optional().default(''),
  FIELD_ENCRYPTION_MASTER_KEY: z.string().optional().default(''),
  BLIND_INDEX_KEY: z.string().optional().default(''),
  FEATURE_BIOMETRIC: boolish,
  FEATURE_PAYMENT_GATEWAY: boolish,
  LOG_LEVEL: z.string().default('info'),
  COOKIE_SECURE: boolish,
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${msg}`);
  }
  const data = parsed.data;
  const hasR2 =
    !!(data.R2_ACCOUNT_ID || data.R2_ENDPOINT) &&
    !!data.R2_ACCESS_KEY_ID &&
    !!data.R2_SECRET_ACCESS_KEY &&
    !!data.R2_BUCKET_NAME;
  const hasMinio =
    !!data.MINIO_ENDPOINT && !!data.MINIO_ACCESS_KEY && !!data.MINIO_SECRET_KEY;
  if (!hasR2 && !hasMinio) {
    throw new Error(
      'Invalid environment configuration: set Cloudflare R2_* (R2_ACCOUNT_ID or R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME) or legacy MINIO_*',
    );
  }
  return data;
}
