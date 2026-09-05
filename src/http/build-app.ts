import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { EmailProvider } from '../domain/email-provider.js';
import type { ProjectConfig } from '../domain/project.js';
import { SendEmailUseCase } from '../application/send-email.js';
import type { EmailDeliveryStore } from '../domain/email-delivery.js';
import { InMemoryEmailDeliveryStore } from '../infrastructure/storage/in-memory-email-delivery-store.js';
import type { EmailAccountStore } from '../application/email-account-store.js';
import { InMemoryEmailAccountStore } from '../infrastructure/storage/in-memory-email-account-store.js';
import { SmtpProvider, type EmailAccount } from '../domain/smtp-provider.js';
import { AdminAuth, AdminLoginRateLimiter } from '../security/admin-auth.js';
import { resolveProjectFromAuthorization } from '../security/api-key-auth.js';
import { UnknownTemplateError } from '../templates/template-registry.js';
import { maskRecipients } from './mask-email.js';
import { previewPage } from './preview-page.js';
import { listTemplatePreviews } from '../templates/template-preview-data.js';
import { adminLoginPage } from './admin-login-page.js';
import { adminDashboardPage } from './admin-dashboard-page.js';
import { AdminAuth, AdminLoginRateLimiter, adminSessionCookie, clearAdminSessionCookie } from '../security/admin-auth.js';
import { z } from 'zod';
import { safeErrorDetails } from './safe-error.js';
import type { RateLimiter } from '../application/rate-limiter.js';
import { InMemoryRateLimiter } from '../infrastructure/rate-limit/in-memory-rate-limiter.js';
import { GatewayMetrics } from '../observability/metrics.js';
import type { EmailJobQueue } from '../application/email-job-queue.js';
import { registerRestRoutes } from './routes/rest-routes.js';
import { registerUiRoutes } from './routes/ui-routes.js';
import type { CreateEmailAccountInput, UpdateEmailAccountInput } from '../application/email-account-store.js';

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
  
  registerRestRoutes(app, { projects, sendEmail, adminAuth, adminLoginRateLimiter, secureAdminCookie, deliveryStore, rateLimiter, metrics, emailQueue });
  registerUiRoutes(app, { adminAuth });
  

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


  function enforceRateLimit(projectId: string, reply: FastifyReply): boolean {
    const decision = rateLimiter.consume(projectId);
    reply.header('RateLimit-Limit', decision.limit.toString()).header('RateLimit-Remaining', decision.remaining.toString()).header('RateLimit-Reset', Math.ceil(decision.resetAt / 1000).toString());
    if (decision.allowed) return true;
    reply.code(429).header('Retry-After', decision.retryAfterSeconds.toString()).send({ error: 'rate_limited', message: 'Too many requests for this project. Try again later.' });
    return false;
  }

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async () => ({ status: 'ready' }));
  app.get('/metrics', async (_request, reply) => reply.type('text/plain; version=0.0.4; charset=utf-8').send(metrics.renderPrometheus()));

  app.post('/admin/login', async (request, reply) => {
    const rateLimitKey = request.ip;
    if (!adminLoginRateLimiter.canAttempt(rateLimitKey)) return reply.code(429).header('Retry-After', adminLoginRateLimiter.retryAfterSeconds(rateLimitKey).toString()).send({ error: 'rate_limited', message: 'Too many failed login attempts. Try again later.' });
    const parsed = z.object({ username: z.string().min(1), password: z.string().min(1) }).strict().safeParse(request.body);
    if (!parsed.success) {
      adminLoginRateLimiter.recordFailure(rateLimitKey);
      return reply.code(400).send({ error: 'invalid_request', message: 'Username and password are required' });
    }
    const token = adminAuth.login(parsed.data.username, parsed.data.password);
    if (!token) {
      adminLoginRateLimiter.recordFailure(rateLimitKey);
      return reply.code(401).send({ error: 'unauthorized', message: 'Invalid administrator credentials' });
    }
    adminLoginRateLimiter.recordSuccess(rateLimitKey);
    return reply.code(204).header('Set-Cookie', adminSessionCookie(token, secureAdminCookie)).send();
  });

  app.post('/admin/logout', async (request, reply) => reply.code(204).header('Set-Cookie', clearAdminSessionCookie).send());

  app.get('/admin', async (request, reply) => {
    if (!adminAuth.isAuthenticated(request.headers.cookie)) return reply.code(200).header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(adminLoginPage());
    const accountsWithLinks = await emailAccountStore.listWithProjectLinks();
    return reply.header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(adminDashboardPage({
      projects,
      emailAccounts: accountsWithLinks.map((a) => a.account),
      accountLinks: accountsWithLinks,
      metrics,
      emailQueue,
    }));
  });

  app.get('/admin/emails', async (request, reply) => {
    if (!adminAuth.isAuthenticated(request.headers.cookie)) return reply.code(401).send({ error: 'admin_authentication_required' });
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_request' });
    const deliveries = await deliveryStore.list({ limit: query.data.limit });
    return { data: deliveries.map((delivery) => ({ ...delivery, to: maskRecipients(delivery.to), idempotencyKey: undefined, payloadHash: undefined })) };
  });

  const createEmailAccountSchema = z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().email(),
    provider: z.nativeEnum(SmtpProvider),
    credentials: z.object({ username: z.string().min(1), password: z.string().min(1) }),
    active: z.boolean().optional(),
  }).strict();

  const updateEmailAccountSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().email().optional(),
    provider: z.nativeEnum(SmtpProvider).optional(),
    credentials: z.object({ username: z.string().min(1), password: z.string().min(1) }).optional(),
    active: z.boolean().optional(),
  }).strict();

  const linkProjectSchema = z.object({
    projectId: z.string().min(1).max(100),
    isDefault: z.boolean().optional(),
  }).strict();

  function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
    const cookie = request.headers.cookie;
    if (!adminAuth.isAuthenticated(cookie)) {
      reply.code(401).send({ error: 'admin_authentication_required' });
      return false;
    }
    return true;
  }

  app.get('/admin/email-accounts', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const accounts = await emailAccountStore.listWithProjectLinks();
    return { data: accounts };
  });

  app.post('/admin/email-accounts', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const parsed = createEmailAccountSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
    try {
      const account = await emailAccountStore.create(parsed.data);
      return reply.code(201).send(account);
    } catch (error) {
      request.log.error({ error: safeErrorDetails(error) }, 'failed to create email account');
      return reply.code(500).send({ error: 'creation_failed', message: 'Could not create email account' });
    }
  });

  app.patch('/admin/email-accounts/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_request' });
    const parsed = updateEmailAccountSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
    try {
      const account = await emailAccountStore.update(params.data.id, parsed.data);
      return account;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return reply.code(404).send({ error: 'not_found', message: error.message });
      request.log.error({ error: safeErrorDetails(error) }, 'failed to update email account');
      return reply.code(500).send({ error: 'update_failed', message: 'Could not update email account' });
    }
  });

  app.delete('/admin/email-accounts/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_request' });
    try {
      await emailAccountStore.delete(params.data.id);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return reply.code(404).send({ error: 'not_found', message: error.message });
      request.log.error({ error: safeErrorDetails(error) }, 'failed to delete email account');
      return reply.code(500).send({ error: 'deletion_failed', message: 'Could not delete email account' });
    }
  });

  app.post('/admin/email-accounts/:id/projects', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_request' });
    const parsed = linkProjectSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
    const project = projects.find((p) => p.id === parsed.data.projectId);
    if (!project) return reply.code(404).send({ error: 'not_found', message: 'Project not found' });
    try {
      await emailAccountStore.linkToProject(parsed.data.projectId, params.data.id, parsed.data.isDefault ?? false);
      return reply.code(204).send();
    } catch (error) {
      request.log.error({ error: safeErrorDetails(error) }, 'failed to link email account to project');
      return reply.code(500).send({ error: 'link_failed', message: 'Could not link email account to project' });
    }
  });

  app.delete('/admin/email-accounts/:id/projects/:projectId', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const params = z.object({ id: z.string().uuid(), projectId: z.string().min(1).max(100) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_request' });
    try {
      await emailAccountStore.unlinkFromProject(params.data.projectId, params.data.id);
      return reply.code(204).send();
    } catch (error) {
      request.log.error({ error: safeErrorDetails(error) }, 'failed to unlink email account from project');
      return reply.code(500).send({ error: 'unlink_failed', message: 'Could not unlink email account from project' });
    }
  });

  app.patch('/admin/email-accounts/:id/projects/:projectId', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const params = z.object({ id: z.string().uuid(), projectId: z.string().min(1).max(100) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_request' });
    try {
      await emailAccountStore.setDefaultForProject(params.data.projectId, params.data.id);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof Error && error.message.includes('not linked')) return reply.code(404).send({ error: 'not_found', message: error.message });
      request.log.error({ error: safeErrorDetails(error) }, 'failed to set default email account');
      return reply.code(500).send({ error: 'update_failed', message: 'Could not set default email account' });
    }
  });

  app.get('/v1/projects/me', async (request, reply) => {
    if (!adminAuth.isAuthenticated(request.headers.cookie)) return reply.code(401).send({ error: 'admin_authentication_required', message: 'Administrator login is required' });
    const project = resolveProjectFromAuthorization(request.headers.authorization, projects);
    if (!project) return reply.code(401).send({ error: 'unauthorized', message: 'Missing or invalid project API key' });
    return { projectId: project.id, fromEmail: project.fromEmail, allowedTemplates: project.allowedTemplates };
  });

  app.get('/preview', async (_request, reply) => {
    if (!adminAuth.isAuthenticated(_request.headers.cookie)) return reply.code(200).header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(adminLoginPage());
    return reply.header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(previewPage(listTemplatePreviews()));
  });

  app.post('/v1/emails/preview', async (request, reply) => {
    if (!adminAuth.isAuthenticated(request.headers.cookie)) return reply.code(401).send({ error: 'admin_authentication_required', message: 'Administrator login is required for template preview' });
    const project = resolveProjectFromAuthorization(request.headers.authorization, projects);
    if (!project) return reply.code(401).send({ error: 'unauthorized', message: 'Missing or invalid project API key' });
    if (!enforceRateLimit(project.id, reply)) return;
    const parsed = previewEmailInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
    try {
      const result = await sendEmail.preview(project, parsed.data);
      return reply.code(200).type('text/html; charset=utf-8').header('X-Email-Subject', result.subject).send(result.html);
    } catch (error) {
      if (error instanceof UnknownTemplateError) return reply.code(400).send({ error: 'unknown_template', message: 'The requested template does not exist' });
      if (error instanceof TemplateNotAllowedError) return reply.code(403).send({ error: 'template_not_allowed', message: 'The requested template is not allowed for this project' });
      if (error instanceof ZodError) return reply.code(400).send({ error: 'invalid_template_data', issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
      request.log.error({ error: safeErrorDetails(error), projectId: project.id, template: parsed.data.template }, 'email preview failed');
      return reply.code(500).send({ error: 'preview_failure', message: 'The email preview could not be rendered' });
    }
  });

  app.post('/v1/emails', async (request, reply) => {
    const project = resolveProjectFromAuthorization(request.headers.authorization, projects);
    if (!project) return reply.code(401).send({ error: 'unauthorized', message: 'Missing or invalid project API key' });
    if (!enforceRateLimit(project.id, reply)) return;
    const parsed = sendEmailInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
    const headerKey = request.headers['idempotency-key'];
    if (Array.isArray(headerKey)) return reply.code(400).send({ error: 'invalid_request', message: 'Idempotency-Key must be a single value' });
    if (headerKey !== undefined && (headerKey.trim().length < 1 || headerKey.trim().length > 256)) return reply.code(400).send({ error: 'invalid_request', message: 'Idempotency-Key must contain 1 to 256 characters' });
    if (headerKey && parsed.data.idempotencyKey && headerKey.trim() !== parsed.data.idempotencyKey) return reply.code(400).send({ error: 'invalid_request', message: 'Idempotency-Key conflicts with the request body' });
    const input = headerKey ? { ...parsed.data, idempotencyKey: headerKey.trim() } : parsed.data;

    try {
      const result = emailQueue ? await sendEmail.enqueue(project, input, emailQueue) : await sendEmail.execute(project, input);
      request.log.info({ projectId: project.id, template: parsed.data.template, recipients: maskRecipients(input.to), status: result.status }, 'email request processed');
      metrics.increment('email_gateway_deliveries_total', { status: result.status });
      return reply.code(result.status === 'accepted' || result.status === 'processing' || result.status === 'queued' ? 202 : 200).send(result);
    } catch (error) {
      if (error instanceof UnknownTemplateError) return reply.code(400).send({ error: 'unknown_template', message: 'The requested template does not exist' });
      if (error instanceof TemplateNotAllowedError) return reply.code(403).send({ error: 'template_not_allowed', message: 'The requested template is not allowed for this project' });
      if (error instanceof EmailAccountNotFoundError) return reply.code(422).send({ error: 'email_account_not_available', message: 'No usable email account is configured for this project' });
      if (error instanceof EmailAccountInactiveError) return reply.code(422).send({ error: 'email_account_inactive', message: 'The selected email account is inactive' });
      if (error instanceof IdempotencyConflictError) return reply.code(409).send({ error: 'idempotency_key_conflict', message: 'The idempotency key was already used with a different payload' });
      if (error instanceof EmailDeliveryFailedError) {
        metrics.increment('email_gateway_deliveries_total', { status: 'failed' });
        request.log.error({ errorName: error.name, errorCode: error.errorCode, deliveryId: error.deliveryId, projectId: project.id, template: input.template }, 'email delivery failed');
        return reply.code(502).send({ error: 'email_provider_failure', message: 'The email provider could not accept the message', deliveryId: error.deliveryId });
      }
      if (error instanceof ZodError) return reply.code(400).send({ error: 'invalid_template_data', issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
      request.log.error({ error: safeErrorDetails(error), projectId: project.id, template: input.template }, 'email provider failure');
      metrics.increment('email_gateway_deliveries_total', { status: 'failed' });
      return reply.code(502).send({ error: 'email_provider_failure', message: 'The email provider could not accept the message' });
    }
  });

  app.get('/v1/emails/:id', async (request, reply) => {
    const project = resolveProjectFromAuthorization(request.headers.authorization, projects);
    if (!project) return reply.code(401).send({ error: 'unauthorized', message: 'Missing or invalid project API key' });
    const params = z.object({ id: z.string().min(1).max(100) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_request' });
    const delivery = await deliveryStore.getById(params.data.id);
    if (!delivery || delivery.projectId !== project.id) return reply.code(404).send({ error: 'not_found', message: 'Email delivery not found' });
    return delivery;
  });

  return app;
}
