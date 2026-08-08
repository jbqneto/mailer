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
import { InMemoryRateLimiter } from './infrastructure/rate-limit/in-memory-rate-limiter.js';

const projects = loadProjects();
const emailProvider = new SmtpEmailProvider();
const adminAuth = new AdminAuth(loadAdminCredentials());
const rateLimiter = new InMemoryRateLimiter({
  maxRequests: runtimeEnv.RATE_LIMIT_MAX_REQUESTS,
  windowMs: runtimeEnv.RATE_LIMIT_WINDOW_SECONDS * 1000,
});

const app = buildApp({
  projects,
  emailProvider,
  adminAuth,
  deliveryStore: createEmailDeliveryStore(),
  rateLimiter,
  secureAdminCookie: runtimeEnv.NODE_ENV === 'production',
  logger: {
    level: runtimeEnv.LOG_LEVEL,
  },
});

async function start(): Promise<void> {
  try {
    await app.listen({
      host: runtimeEnv.HOST,
      port: runtimeEnv.PORT,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');

  try {
    await app.close();
    await emailProvider.close?.();
    process.exit(0);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await start();
