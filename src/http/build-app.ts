import Fastify, { type FastifyInstance } from 'fastify';
import type { EmailProvider } from '../domain/email-provider.js';
import type { ProjectConfig } from '../domain/project.js';
import { SendEmailUseCase } from '../application/send-email.js';
import type { EmailDeliveryStore } from '../domain/email-delivery.js';
import { InMemoryEmailDeliveryStore } from '../infrastructure/storage/in-memory-email-delivery-store.js';
import type { EmailAccountStore } from '../application/email-account-store.js';
import { InMemoryEmailAccountStore } from '../infrastructure/storage/in-memory-email-account-store.js';
import { SmtpProvider, type EmailAccount } from '../domain/smtp-provider.js';
import { AdminAuth, AdminLoginRateLimiter } from '../security/admin-auth.js';
import type { RateLimiter } from '../application/rate-limiter.js';
import { InMemoryRateLimiter } from '../infrastructure/rate-limit/in-memory-rate-limiter.js';
import { GatewayMetrics } from '../observability/metrics.js';
import type { EmailJobQueue } from '../application/email-job-queue.js';
import { registerRestRoutes } from './routes/rest-routes.js';
import { registerUiRoutes } from './routes/ui-routes.js';

interface BuildAppDependencies {
  projects: ProjectConfig[];
  emailProvider: EmailProvider;
  emailAccountStore?: EmailAccountStore;
  adminAuth: AdminAuth;
  adminLoginRateLimiter?: AdminLoginRateLimiter;
  secureAdminCookie?: boolean;
  deliveryStore?: EmailDeliveryStore;
  rateLimiter?: RateLimiter;
  bodyLimit?: number;
  trustProxy?: boolean;
  metrics?: GatewayMetrics;
  emailQueue?: EmailJobQueue;
  logger?: boolean | { level: string };
}

function createTestAccountStore(projects: readonly ProjectConfig[]): EmailAccountStore {
  const accounts: EmailAccount[] = projects.map((project) => ({ id: `test-account-${project.id}`, name: `${project.id}-default`, email: project.fromEmail, provider: SmtpProvider.PURELY_MAIL, credentials: { username: 'test', password: 'test' }, active: true }));
  const defaults = new Map(projects.map((project) => [project.id, `test-account-${project.id}`]));
  const projectAccounts = new Map(projects.map((project) => [project.id, [`test-account-${project.id}`]] as const));
  return new InMemoryEmailAccountStore(accounts, defaults, projectAccounts);
}

export function buildApp({
  projects,
  emailProvider,
  emailAccountStore = process.env.NODE_ENV === 'test' ? createTestAccountStore(projects) : new InMemoryEmailAccountStore(),
  adminAuth,
  adminLoginRateLimiter = new AdminLoginRateLimiter(),
  secureAdminCookie = false,
  deliveryStore = new InMemoryEmailDeliveryStore(),
  rateLimiter = new InMemoryRateLimiter(),
  bodyLimit = 1_048_576,
  trustProxy = false,
  metrics = new GatewayMetrics(),
  emailQueue,
  logger = true,
}: BuildAppDependencies): FastifyInstance {
  const app = Fastify({ logger, bodyLimit, trustProxy });
  const sendEmail = new SendEmailUseCase(emailProvider, deliveryStore, emailAccountStore);
  const requestStartedAt = new WeakMap<object, bigint>();

  app.addHook('onRequest', async (request, reply) => {
    requestStartedAt.set(request, process.hrtime.bigint());
    reply.header('X-Request-Id', request.id);
  });

  app.addHook('onResponse', async (request, reply) => {
    const startedAt = requestStartedAt.get(request);
    const durationMs = startedAt === undefined ? 0 : Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    metrics.increment('email_gateway_http_requests_total', { method: request.method, route: request.routeOptions.url ?? 'unknown', status_code: reply.statusCode.toString() });
    metrics.observe('email_gateway_http_request_duration_ms', durationMs, { method: request.method, route: request.routeOptions.url ?? 'unknown' });
  });

  registerRestRoutes(app, { projects, sendEmail, adminAuth, adminLoginRateLimiter, secureAdminCookie, deliveryStore, rateLimiter, metrics, emailQueue });
  registerUiRoutes(app, { adminAuth });
  return app;
}
