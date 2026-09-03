import dotenv from 'dotenv';

dotenv.config({
  path: process.env.ENV_FILE ?? '.env',
});
import { runtimeEnv } from './config/env.js';
import { loadProjects } from './config/projects.js';
import { buildApp } from './http/build-app.js';
import { SmtpEmailProvider } from './infrastructure/smtp/smtp-email-provider.js';
import { AdminAuth, loadAdminCredentials } from './security/admin-auth.js';
import { createEmailDeliveryStore } from './infrastructure/storage/create-email-delivery-store.js';
import { createEmailAccountStore } from './infrastructure/storage/create-email-account-store.js';
import { InMemoryRateLimiter } from './infrastructure/rate-limit/in-memory-rate-limiter.js';
import { InMemoryEmailJobQueue } from './infrastructure/queue/in-memory-email-job-queue.js';
import { SendEmailUseCase } from './application/send-email.js';
import { createClient } from '@supabase/supabase-js';
import { SupabaseEmailJobQueue } from './infrastructure/queue/supabase-email-job-queue.js';

const projects = loadProjects();

if (!runtimeEnv.SUPABASE_URL || !runtimeEnv.SUPABASE_SERVICE_ROLE_KEY || !runtimeEnv.MAILER_MASTER_KEY) {
  throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and MAILER_MASTER_KEY are required for email account storage');
}

const emailAccountStore = createEmailAccountStore({
  supabaseUrl: runtimeEnv.SUPABASE_URL,
  serviceRoleKey: runtimeEnv.SUPABASE_SERVICE_ROLE_KEY,
  schema: runtimeEnv.SUPABASE_SCHEMA,
  masterKey: runtimeEnv.MAILER_MASTER_KEY,
});
const emailProvider = new SmtpEmailProvider({
  maxAttempts: runtimeEnv.SMTP_MAX_ATTEMPTS,
  initialDelayMs: runtimeEnv.SMTP_RETRY_DELAY_MS,
});
const deliveryStore = createEmailDeliveryStore();
const workerUseCase = new SendEmailUseCase(emailProvider, deliveryStore, emailAccountStore);
const adminAuth = new AdminAuth(loadAdminCredentials());
const rateLimiter = new InMemoryRateLimiter({
  maxRequests: runtimeEnv.RATE_LIMIT_MAX_REQUESTS,
  windowMs: runtimeEnv.RATE_LIMIT_WINDOW_SECONDS * 1000,
});
const jobHandler = async (job: import('./application/email-job-queue.js').EmailJob): Promise<void> => {
  await workerUseCase.processJob(job);
};

const queueOptions = {
  concurrency: runtimeEnv.QUEUE_CONCURRENCY,
  maxAttempts: runtimeEnv.QUEUE_MAX_ATTEMPTS,
  retryDelayMs: runtimeEnv.QUEUE_RETRY_DELAY_MS,
  handler: jobHandler,
  onJobError: (job: import('./application/email-job-queue.js').EmailJob, error: unknown) => {
    app.log.error({ jobId: job.id, error }, 'email job failed');
  },
};

const emailQueue = runtimeEnv.QUEUE_STORE === 'supabase'
  ? new SupabaseEmailJobQueue({
      ...queueOptions,
      client: createClient(
        runtimeEnv.SUPABASE_URL,
        runtimeEnv.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } },
      ),
    })
  : new InMemoryEmailJobQueue(queueOptions);

const app = buildApp({
  projects,
  emailProvider,
  emailAccountStore,
  adminAuth,
  deliveryStore,
  rateLimiter,
  emailQueue,
  bodyLimit: runtimeEnv.BODY_LIMIT_BYTES,
  trustProxy: runtimeEnv.TRUST_PROXY,
  secureAdminCookie: runtimeEnv.NODE_ENV === 'production',
  logger: {
    level: runtimeEnv.LOG_LEVEL,
  },
});

emailQueue.start?.();

async function start(): Promise<void> {
  try {
    await app.listen({ host: runtimeEnv.HOST, port: runtimeEnv.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
    await emailQueue.close();
    await emailProvider.close?.();
    process.exit(0);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

void start();
