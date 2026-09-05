import { describe, expect, it } from 'vitest';
import type {
  EmailMessage,
  EmailProvider,
} from '../domain/email-provider.js';
import type { ProjectConfig } from '../domain/project.js';
import { SmtpProvider, type EmailAccount } from '../domain/smtp-provider.js';
import { InMemoryEmailDeliveryStore } from '../infrastructure/storage/in-memory-email-delivery-store.js';
import {
  SendEmailUseCase,
  TemplateNotAllowedError,
} from './send-email.js';
import { UnknownTemplateError } from '../templates/template-registry.js';
import { InMemoryEmailJobQueue } from '../infrastructure/queue/in-memory-email-job-queue.js';

class FakeEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];

  async send(
    _account: EmailAccount,
    message: EmailMessage,
  ): Promise<{ messageId: string }> {
    this.sent.push(message);
    return { messageId: 'fake-message-id' };
  }
}

const project = {
  id: 'test-project',
  apiKey: 'x'.repeat(32),
  fromEmail: 'noreply@example.com',
  fromName: 'Test Project',
  allowedTemplates: ['*'] as const,
};

const testAccount: EmailAccount = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'test-default',
  email: 'noreply@example.com',
  provider: SmtpProvider.PURELY_MAIL,
  credentials: { username: 'test', password: 'test' },
  active: true,
};

describe('SendEmailUseCase', () => {
  it('renders and sends a registered template', async () => {
    const provider = new FakeEmailProvider();
    const useCase = new SendEmailUseCase(
      provider,
      new InMemoryEmailDeliveryStore(),
    );

    const result = await useCase.execute(project, {
      template: 'welcome-user',
      to: 'user@example.com',
      data: {
        name: 'Neto',
        actionUrl: 'https://example.com/activate',
      },
      idempotencyKey: 'welcome:user-123',
    });

    expect(result.status).toBe('accepted');
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]?.subject).toContain('Neto');
    expect(provider.sent[0]?.html).toContain('Bem-vindo');
  });

  it('renders the Bloom shared access invitation template', async () => {
    const provider = new FakeEmailProvider();
    const useCase = new SendEmailUseCase(provider, new InMemoryEmailDeliveryStore());

    const result = await useCase.execute(project, {
      template: 'shared-access-invitation',
      to: 'partner@example.com',
      data: {
        recipientName: 'João',
        ownerName: 'Maria',
        permissionLabel: 'leitura e escrita',
        actionUrl: 'https://bloom.example/invitations/token',
        expiresAt: '10/08/2026',
      },
    });

    expect(result.status).toBe('accepted');
    expect(provider.sent[0]?.subject).toContain('Maria');
    expect(provider.sent[0]?.html).toContain('Aceitar convite');
    expect(provider.sent[0]?.html).toContain('leitura e escrita');
  });

  it('rejects invalid Bloom shared access template data', async () => {
    const provider = new FakeEmailProvider();
    const useCase = new SendEmailUseCase(provider, new InMemoryEmailDeliveryStore());

    await expect(
      useCase.execute(project, {
        template: 'shared-access-invitation',
        to: 'partner@example.com',
        data: {
          recipientName: 'João',
          ownerName: 'Maria',
          actionUrl: 'not-a-url',
        },
      }),
    ).rejects.toThrow();

    expect(provider.sent).toHaveLength(0);
  });

  it('suppresses a duplicate idempotency key', async () => {
    const provider = new FakeEmailProvider();
    const useCase = new SendEmailUseCase(
      provider,
      new InMemoryEmailDeliveryStore(),
    );

    const input = {
      template: 'generic-notification',
      to: 'user@example.com',
      data: {
        title: 'Hello',
        message: 'World',
      },
      idempotencyKey: 'notification:event-123',
    } as const;

    const first = await useCase.execute(project, input);
    const second = await useCase.execute(project, input);

    expect(first.status).toBe('accepted');
    expect(second.status).toBe('duplicate');
    expect(provider.sent).toHaveLength(1);
  });

  it('does not send twice when the same idempotency key is concurrent', async () => {
    let releaseProvider!: () => void;
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    class SlowProvider extends FakeEmailProvider {
      override async send(account: EmailAccount, message: EmailMessage) {
        const sending = super.send(account, message);
        markProviderStarted();
        await release;
        return sending;
      }
    }

    const provider = new SlowProvider();
    const useCase = new SendEmailUseCase(provider, new InMemoryEmailDeliveryStore());
    const input = {
      template: 'generic-notification',
      to: 'user@example.com',
      data: { title: 'Hello', message: 'World' },
      idempotencyKey: 'notification:concurrent-123',
    } as const;

    const firstPromise = useCase.execute(project, input);
    await providerStarted;
    const second = await useCase.execute(project, input);
    releaseProvider();
    const first = await firstPromise;

    expect(second).toMatchObject({ status: 'processing', id: first.id });
    expect(provider.sent).toHaveLength(1);
  });

  it('keeps a failed idempotent delivery reserved to avoid an uncertain resend', async () => {
    class FailingProvider implements EmailProvider {
      async send(): Promise<{ messageId: string }> {
        throw Object.assign(new Error('temporary SMTP failure'), { code: 'ETIMEDOUT' });
      }
    }

    const store = new InMemoryEmailDeliveryStore();
    const useCase = new SendEmailUseCase(new FailingProvider(), store);
    const input = {
      template: 'generic-notification',
      to: 'user@example.com',
      data: { title: 'Hello', message: 'World' },
      idempotencyKey: 'notification:failed-123',
    } as const;

    await expect(useCase.execute(project, input)).rejects.toThrow('email delivery failed');
    await expect(useCase.execute(project, input)).rejects.toThrow('email delivery failed');

    const deliveries = await store.list();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ status: 'failed', errorCode: 'ETIMEDOUT' });
  });

  it('reserves and enqueues delivery without waiting for the provider', async () => {
    const provider = new FakeEmailProvider();
    const useCase = new SendEmailUseCase(provider, new InMemoryEmailDeliveryStore());
    const queue = new InMemoryEmailJobQueue({
      handler: (job) => useCase.processJob(job),
    });

    const result = await useCase.enqueue(project, {
      template: 'generic-notification',
      to: 'user@example.com',
      data: { title: 'Hello', message: 'World' },
      idempotencyKey: 'notification:queued-123',
    }, queue);

    expect(result).toMatchObject({ status: 'queued', template: 'generic-notification' });
    await queue.close();
    expect(provider.sent).toHaveLength(1);
  });

  it('rejects invalid template data before calling the provider', async () => {
    const provider = new FakeEmailProvider();
    const useCase = new SendEmailUseCase(
      provider,
      new InMemoryEmailDeliveryStore(),
    );

    await expect(
      useCase.execute(project, {
        template: 'welcome-user',
        to: 'user@example.com',
        data: {
          banana: 123,
        },
      }),
    ).rejects.toThrow();

    expect(provider.sent).toHaveLength(0);
  });

  it('rejects unknown templates before calling the provider', async () => {
    const provider = new FakeEmailProvider();
    const useCase = new SendEmailUseCase(
      provider,
      new InMemoryEmailDeliveryStore(),
    );

    await expect(
      useCase.execute(project, {
        template: 'does-not-exist',
        to: 'user@example.com',
        data: {},
      }),
    ).rejects.toBeInstanceOf(UnknownTemplateError);

    expect(provider.sent).toHaveLength(0);
  });

  it('rejects templates outside the project allowlist', async () => {
    const provider = new FakeEmailProvider();
    const useCase = new SendEmailUseCase(
      provider,
      new InMemoryEmailDeliveryStore(),
    );
    const restrictedProject = {
      ...project,
      allowedTemplates: ['generic-notification'],
    };

    await expect(
      useCase.execute(restrictedProject, {
        template: 'welcome-user',
        to: 'user@example.com',
        data: {
          name: 'Neto',
          actionUrl: 'https://example.com/activate',
        },
      }),
    ).rejects.toBeInstanceOf(TemplateNotAllowedError);

    expect(provider.sent).toHaveLength(0);
  });
});
