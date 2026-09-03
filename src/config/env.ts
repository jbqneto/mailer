import { z } from 'zod';

const runtimeEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  TRUST_PROXY: z.preprocess(
    (value) => (value === 'true' ? true : value === 'false' ? false : value),
    z.boolean().default(false),
  ),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1_024).max(10_485_760).default(1_048_576),
  SMTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  SMTP_RETRY_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(250),
  QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
  QUEUE_STORE: z.enum(['memory', 'supabase']).default('memory'),
  QUEUE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  QUEUE_RETRY_DELAY_MS: z.coerce.number().int().min(0).max(300_000).default(1_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  DELIVERY_STORE: z.enum(['memory', 'supabase']).default('memory'),
  SUPABASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
  ),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  SUPABASE_SCHEMA: z.string().regex(/^[a-z_][a-z0-9_]*$/).default('mailer'),
  MAILER_MASTER_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
});

export const runtimeEnv = runtimeEnvSchema.parse(process.env);
