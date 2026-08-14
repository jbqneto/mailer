import { describe, expect, it } from 'vitest';
import type {
  EmailMessage,
  EmailProvider,
} from '../domain/email-provider.js';
import type { ProjectConfig } from '../domain/project.js';
import {
  AdminAuth,
  AdminLoginRateLimiter,
} from '../security/admin-auth.js';
import { buildApp } from './build-app.js';
import { InMemoryRateLimiter } from '../infrastructure/rate-limit/in-memory-rate-limiter.js';

class FakeEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];

  async send(
    _project: ProjectConfig,
    message: EmailMessage,
  ): Promise<{ messageId: string }> {
    this.sent.push(message);
    return { messageId: 'fake-message-id' };
  }
}

class FailingEmailProvider implements EmailProvider {
  async send(): Promise<{ messageId: string }> {
    throw new Error('SMTP connection failed');
  }
}

const project: ProjectConfig = {
  id: 'preview-project',
  apiKey: 'p'.repeat(32),
  fromEmail: 'noreply@example.com',
  fromName: 'Preview Project',
  smtp: {
    host: 'localhost',
    port: 1025,
    secure: false,
    auth: false,
  },
  allowedTemplates: ['*'],
};

const adminAuth = new AdminAuth({
  username: 'admin',
  password: 'correct horse battery staple',
});
const adminToken = adminAuth.login('admin', 'correct horse battery staple');
const adminCookie = `email_gateway_admin=${adminToken}`;

describe('POST /v1/emails/preview', () => {
  it('exposes a readiness check without probing SMTP', async () => {
    const app = buildApp({
      projects: [project],
      emailProvider: new FakeEmailProvider(),
      adminAuth,
      logger: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.json()).toEqual({ status: 'ready' });

    await app.close();
  });

  it('exposes aggregated Prometheus metrics without sensitive request data', async () => {
    const app = buildApp({
      projects: [project],
      emailProvider: new FakeEmailProvider(),
      adminAuth,
      logger: false,
    });

    await app.inject({ method: 'GET', url: '/health' });
    const response = await app.inject({ method: 'GET', url: '/metrics' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('email_gateway_http_requests_total');
    expect(response.body).not.toContain('recipient@example.com');

    await app.close();
  });

  it('identifies the project associated with an admin-authenticated API key', async () => {
    const app = buildApp({
      projects: [project],
      emailProvider: new FakeEmailProvider(),
      adminAuth,
      logger: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/projects/me',
      headers: {
        cookie: adminCookie,
        authorization: `Bearer ${project.apiKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      projectId: project.id,
      fromEmail: project.fromEmail,
    });

    await app.close();
  });

  it('logs in an administrator and sets an HttpOnly session cookie', async () => {
    const app = buildApp({
      projects: [project],
      emailProvider: new FakeEmailProvider(),
      adminAuth,
      logger: false,
    });

    const invalid = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: {
        username: 'admin',
        password: 'wrong-password',
      },
    });
    expect(invalid.statusCode).toBe(401);

    const valid = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: {
        username: 'admin',
        password: 'correct horse battery staple',
      },
    });
    expect(valid.statusCode).toBe(204);
    expect(valid.headers['set-cookie']).toContain('HttpOnly');

    await app.close();
  });

  it('rate limits repeated failed administrator logins', async () => {
    const app = buildApp({
      projects: [project],
      emailProvider: new FakeEmailProvider(),
      adminAuth,
      adminLoginRateLimiter: new AdminLoginRateLimiter(2, 60_000, 60_000),
      logger: false,
    });

    const payload = {
      username: 'admin',
      password: 'wrong-password',
    };
    expect((await app.inject({ method: 'POST', url: '/admin/login', payload })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/admin/login', payload })).statusCode).toBe(401);

    const blocked = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload,
    });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();

    await app.close();
  });

  it('serves the preview workspace from the same API server', async () => {
    const app = buildApp({
      projects: [project],
      emailProvider: new FakeEmailProvider(),
      adminAuth,
      logger: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/preview',
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Enviar e-mail de teste');
    expect(response.body).toContain('/v1/emails/preview');
    expect(response.body).toContain('shared-access-invitation');

    await app.close();
  });

  it('returns rendered HTML without sending through the provider', async () => {
    const provider = new FakeEmailProvider();
    const app = buildApp({
      projects: [project],
      emailProvider: provider,
      adminAuth,
      logger: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/emails/preview',
      headers: {
        cookie: adminCookie,
        authorization: `Bearer ${project.apiKey}`,
      },
      payload: {
        template: 'welcome-user',
        data: {
          name: 'Neto',
          actionUrl: 'https://example.com/activate',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['x-email-subject']).toBe('Bem-vindo, Neto');
    expect(response.body).toContain('Bem-vindo');
    expect(response.body).toContain('Neto');
    expect(response.body).toContain('https://example.com/activate');
    expect(provider.sent).toHaveLength(0);

    await app.close();
  });

  it('rejects invalid template data before rendering', async () => {
    const provider = new FakeEmailProvider();
    const app = buildApp({
      projects: [project],
      emailProvider: provider,
      adminAuth,
      logger: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/emails/preview',
      headers: {
        cookie: adminCookie,
        authorization: `Bearer ${project.apiKey}`,
      },
      payload: {
        template: 'welcome-user',
        data: {
          name: 'Neto',
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid_template_data',
    });
    expect(provider.sent).toHaveLength(0);

    await app.close();
  });

  it('requires administrator authentication for the preview workspace', async () => {
    const app = buildApp({
      projects: [project],
      emailProvider: new FakeEmailProvider(),
      adminAuth,
      logger: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/preview',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Sign in');
    expect(response.body).not.toContain('Enviar e-mail de teste');

    const previewApiResponse = await app.inject({
      method: 'POST',
      url: '/v1/emails/preview',
      headers: {
        authorization: `Bearer ${project.apiKey}`,
      },
      payload: {
        template: 'welcome-user',
        data: {
          name: 'Neto',
          actionUrl: 'https://example.com/activate',
        },
      },
    });
    expect(previewApiResponse.statusCode).toBe(401);

    await app.close();
  });
});

describe('POST /v1/emails', () => {
  it('rate limits authenticated requests per project', async () => {
    const provider = new FakeEmailProvider();
    const app = buildApp({
      projects: [project],
      emailProvider: provider,
      adminAuth,
      rateLimiter: new InMemoryRateLimiter({ maxRequests: 1, windowMs: 60_000 }),
      logger: false,
    });
    const request = {
      method: 'POST' as const,
      url: '/v1/emails',
      headers: { authorization: `Bearer ${project.apiKey}` },
      payload: {
        template: 'generic-notification',
        to: 'recipient@example.com',
        data: { title: 'Hello', message: 'World' },
      },
    };

    const first = await app.inject(request);
    const second = await app.inject(request);

    expect(first.statusCode).toBe(202);
    expect(first.headers['ratelimit-limit']).toBe('1');
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toBeDefined();
    expect(second.json()).toMatchObject({ error: 'rate_limited' });
    expect(provider.sent).toHaveLength(1);
    await app.close();
  });

  it('accepts a valid request and sends exactly one message', async () => {
    const provider = new FakeEmailProvider();
    const app = buildApp({
      projects: [project],
      emailProvider: provider,
      adminAuth,
      logger: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: {
        authorization: `Bearer ${project.apiKey}`,
      },
      payload: {
        template: 'welcome-user',
        to: 'recipient@example.com',
        idempotencyKey: 'http-test-valid-001',
        data: {
          name: 'Neto',
          actionUrl: 'https://example.com/activate',
        },
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      status: 'accepted',
      template: 'welcome-user',
    });
    expect(response.json().id).toMatch(/^email_/);
    expect(provider.sent).toHaveLength(1);

    await app.close();
  });

  it('accepts Idempotency-Key from the header and rejects a conflicting payload', async () => {
    const provider = new FakeEmailProvider();
    const app = buildApp({ projects: [project], emailProvider: provider, adminAuth, logger: false });
    const headers = {
      authorization: `Bearer ${project.apiKey}`,
      'idempotency-key': 'header-key-001',
    };
    const firstPayload = {
      template: 'generic-notification',
      to: 'recipient@example.com',
      data: { title: 'One', message: 'First' },
    };

    const first = await app.inject({ method: 'POST', url: '/v1/emails', headers, payload: firstPayload });
    const duplicate = await app.inject({ method: 'POST', url: '/v1/emails', headers, payload: firstPayload });
    const conflict = await app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers,
      payload: { ...firstPayload, data: { title: 'Two', message: 'Different' } },
    });

    expect(first.statusCode).toBe(202);
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({ status: 'duplicate', id: first.json().id });
    expect(conflict.statusCode).toBe(409);
    expect(provider.sent).toHaveLength(1);
    await app.close();
  });

  it('returns a delivery to its project and exposes recent deliveries to admins', async () => {
    const provider = new FakeEmailProvider();
    const app = buildApp({ projects: [project], emailProvider: provider, adminAuth, logger: false });
    const sent = await app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: { authorization: `Bearer ${project.apiKey}` },
      payload: {
        template: 'generic-notification',
        to: 'recipient@example.com',
        data: { title: 'Hello', message: 'World' },
      },
    });
    const id = sent.json().id;
    const details = await app.inject({
      method: 'GET',
      url: `/v1/emails/${id}`,
      headers: { authorization: `Bearer ${project.apiKey}` },
    });
    const recent = await app.inject({ method: 'GET', url: '/admin/emails', headers: { cookie: adminCookie } });

    expect(details.statusCode).toBe(200);
    expect(details.json()).toMatchObject({ id, status: 'accepted', projectId: project.id });
    expect(details.json().to).toEqual(['recipient@example.com']);
    expect(recent.statusCode).toBe(200);
    expect(recent.json().data[0]).toMatchObject({ id, to: ['re***@example.com'] });
    await app.close();
  });

  it('rejects a missing or invalid project API key', async () => {
    const provider = new FakeEmailProvider();
    const app = buildApp({
      projects: [project],
      emailProvider: provider,
      adminAuth,
      logger: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/emails',
      payload: {
        template: 'welcome-user',
        to: 'recipient@example.com',
        data: {},
      },
    });

    expect(response.statusCode).toBe(401);
    expect(provider.sent).toHaveLength(0);

    await app.close();
  });

  it('maps provider failures to 502 without exposing the error', async () => {
    const app = buildApp({
      projects: [project],
      emailProvider: new FailingEmailProvider(),
      adminAuth,
      logger: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: {
        authorization: `Bearer ${project.apiKey}`,
      },
      payload: {
        template: 'welcome-user',
        to: 'recipient@example.com',
        data: {
          name: 'Neto',
          actionUrl: 'https://example.com/activate',
        },
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('SMTP connection failed');

    await app.close();
  });

  it('keeps a failed idempotency key reserved so retry cannot resend', async () => {
    class RetryProvider extends FakeEmailProvider {
      private attempts = 0;

      override async send(
        projectConfig: ProjectConfig,
        message: EmailMessage,
      ): Promise<{ messageId: string }> {
        this.attempts += 1;
        if (this.attempts === 1) throw new Error('temporary SMTP failure');
        return super.send(projectConfig, message);
      }
    }

    const provider = new RetryProvider();
    const app = buildApp({
      projects: [project],
      emailProvider: provider,
      adminAuth,
      logger: false,
    });
    const payload = {
      template: 'welcome-user',
      to: 'recipient@example.com',
      idempotencyKey: 'http-test-retry-001',
      data: {
        name: 'Neto',
        actionUrl: 'https://example.com/activate',
      },
    } as const;

    const first = await app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: { authorization: `Bearer ${project.apiKey}` },
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: { authorization: `Bearer ${project.apiKey}` },
      payload,
    });

    expect(first.statusCode).toBe(502);
    expect(second.statusCode).toBe(502);
    expect(second.json()).toMatchObject({ error: 'email_provider_failure' });
    expect(provider.sent).toHaveLength(0);

    await app.close();
  });

  it('returns processing for a concurrent request with the same idempotency key', async () => {
    let markStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    class SlowProvider extends FakeEmailProvider {
      override async send(projectConfig: ProjectConfig, message: EmailMessage) {
        const sending = super.send(projectConfig, message);
        markStarted();
        await released;
        return sending;
      }
    }

    const provider = new SlowProvider();
    const app = buildApp({ projects: [project], emailProvider: provider, adminAuth, logger: false });
    const request = {
      method: 'POST' as const,
      url: '/v1/emails',
      headers: { authorization: `Bearer ${project.apiKey}` },
      payload: {
        template: 'generic-notification',
        to: 'recipient@example.com',
        idempotencyKey: 'http-concurrent-001',
        data: { title: 'Hello', message: 'World' },
      },
    };

    const firstPromise = app.inject(request);
    await started;
    const second = await app.inject(request);
    release();
    const first = await firstPromise;

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(second.json()).toMatchObject({ status: 'processing', id: first.json().id });
    expect(provider.sent).toHaveLength(1);
    await app.close();
  });

  it('rejects request bodies larger than the configured limit', async () => {
    const app = buildApp({
      projects: [project],
      emailProvider: new FakeEmailProvider(),
      adminAuth,
      bodyLimit: 1_024,
      logger: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: { authorization: `Bearer ${project.apiKey}` },
      payload: {
        template: 'generic-notification',
        to: 'recipient@example.com',
        data: { title: 'Hello', message: 'x'.repeat(2_000) },
      },
    });

    expect(response.statusCode).toBe(413);
    await app.close();
  });
});
