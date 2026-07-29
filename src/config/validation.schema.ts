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
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_USE_SSL: boolish,
  PRESIGN_TTL_SECONDS: z.coerce.number().default(900),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMS_PROVIDER: z.enum(['console', 'ssl_wireless']).default('console'),
  CORS_ORIGINS: z.string().default('http://localhost:3001'),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  BOOTSTRAP_ADMIN_USERNAME: z.string().optional(),
  SENTRY_DSN: z.string().optional().default(''),
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
  return parsed.data;
}
