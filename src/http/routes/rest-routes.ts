import type { FastifyInstance, FastifyReply } from 'fastify';
import { z, ZodError } from 'zod';
import type { ProjectConfig } from '../../domain/project.js';
import { SendEmailUseCase, EmailDeliveryFailedError, IdempotencyConflictError, previewEmailInputSchema, sendEmailInputSchema, TemplateNotAllowedError } from '../../application/send-email.js';
import type { EmailDeliveryStore } from '../../domain/email-delivery.js';
import { resolveProjectFromAuthorization } from '../../security/api-key-auth.js';
import { UnknownTemplateError } from '../../templates/template-registry.js';
import { maskRecipients } from '../mask-email.js';
import { AdminAuth, AdminLoginRateLimiter, adminSessionCookie, clearAdminSessionCookie } from '../../security/admin-auth.js';
import { safeErrorDetails } from '../safe-error.js';
import type { RateLimiter } from '../../application/rate-limiter.js';
import { GatewayMetrics } from '../../observability/metrics.js';
import type { EmailJobQueue } from '../../application/email-job-queue.js';

export interface RestRouteDependencies {
  projects: ProjectConfig[];
  sendEmail: SendEmailUseCase;
  adminAuth: AdminAuth;
  adminLoginRateLimiter: AdminLoginRateLimiter;
  secureAdminCookie: boolean;
  deliveryStore: EmailDeliveryStore;
  rateLimiter: RateLimiter;
  metrics: GatewayMetrics;
  emailQueue?: EmailJobQueue | undefined;
}

export function registerRestRoutes(app: FastifyInstance, dependencies: RestRouteDependencies): void {
  const { projects, sendEmail, adminAuth, adminLoginRateLimiter, secureAdminCookie, deliveryStore, rateLimiter, metrics, emailQueue } = dependencies;

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
    if (!parsed.success) { adminLoginRateLimiter.recordFailure(rateLimitKey); return reply.code(400).send({ error: 'invalid_request', message: 'Username and password are required' }); }
    const token = adminAuth.login(parsed.data.username, parsed.data.password);
    if (!token) { adminLoginRateLimiter.recordFailure(rateLimitKey); return reply.code(401).send({ error: 'unauthorized', message: 'Invalid administrator credentials' }); }
    adminLoginRateLimiter.recordSuccess(rateLimitKey);
    return reply.code(204).header('Set-Cookie', adminSessionCookie(token, secureAdminCookie)).send();
  });

  app.post('/admin/logout', async (request, reply) => {
    adminAuth.revoke(request.headers.cookie);
    return reply.code(204).header('Set-Cookie', clearAdminSessionCookie).send();
  });

  app.get('/admin/emails', async (request, reply) => {
    if (!adminAuth.isAuthenticated(request.headers.cookie)) return reply.code(401).send({ error: 'admin_authentication_required' });
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_request' });
    const deliveries = await deliveryStore.list({ limit: query.data.limit });
    return { data: deliveries.map((delivery) => ({ ...delivery, to: maskRecipients(delivery.to), idempotencyKey: undefined, payloadHash: undefined })) };
  });

  app.get('/v1/projects/me', async (request, reply) => {
    if (!adminAuth.isAuthenticated(request.headers.cookie)) return reply.code(401).send({ error: 'admin_authentication_required', message: 'Administrator login is required' });
    const project = resolveProjectFromAuthorization(request.headers.authorization, projects);
    if (!project) return reply.code(401).send({ error: 'unauthorized', message: 'Missing or invalid project API key' });
    return { projectId: project.id, fromEmail: project.fromEmail, allowedTemplates: project.allowedTemplates };
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
      if (error instanceof IdempotencyConflictError) return reply.code(409).send({ error: 'idempotency_key_conflict', message: 'The idempotency key was already used with a different payload' });
      if (error instanceof EmailDeliveryFailedError) { metrics.increment('email_gateway_deliveries_total', { status: 'failed' }); request.log.error({ errorName: error.name, errorCode: error.errorCode, deliveryId: error.deliveryId, projectId: project.id, template: input.template }, 'email delivery failed'); return reply.code(502).send({ error: 'email_provider_failure', message: 'The email provider could not accept the message', deliveryId: error.deliveryId }); }
      if (error instanceof ZodError) return reply.code(400).send({ error: 'invalid_template_data', issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
      request.log.error({ error: safeErrorDetails(error), projectId: project.id, template: input.template }, 'email provider failure'); metrics.increment('email_gateway_deliveries_total', { status: 'failed' }); return reply.code(502).send({ error: 'email_provider_failure', message: 'The email provider could not accept the message' });
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
}
