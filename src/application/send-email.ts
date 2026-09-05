import { z } from 'zod';
import type { EmailProvider } from '../domain/email-provider.js';
import type { ProjectConfig } from '../domain/project.js';
import { SmtpProvider, type EmailAccount } from '../domain/smtp-provider.js';
import { compileTemplate, hasTemplate, UnknownTemplateError } from '../templates/template-registry.js';
import { createHash, randomUUID } from 'node:crypto';
import type { EmailDelivery, EmailDeliveryStore } from '../domain/email-delivery.js';
import type { EmailJob, EmailJobQueue } from './email-job-queue.js';
import type { EmailAccountStore } from './email-account-store.js';
import { EmailAccountResolver } from './email-account-resolver.js';

export const sendEmailInputSchema = z.object({
  template: z.string().trim().min(1).max(120),
  to: z.union([z.string().email(), z.array(z.string().email()).min(1).max(20)]),
  data: z.record(z.string(), z.unknown()).default({}),
  sender: z.string().trim().min(1).max(120).optional(),
  idempotencyKey: z.string().trim().min(1).max(256).optional(),
}).strict();

export const previewEmailInputSchema = z.object({
  template: z.string().trim().min(1).max(120),
  data: z.record(z.string(), z.unknown()).default({}),
}).strict();

export type SendEmailInput = z.infer<typeof sendEmailInputSchema>;

export class TemplateNotAllowedError extends Error {
  constructor(template: string, projectId: string) {
    super(`Template "${template}" is not allowed for project "${projectId}"`);
    this.name = 'TemplateNotAllowedError';
  }
}

export type SendEmailResult =
  | { status: 'accepted'; id: string; messageId: string; template: string }
  | { status: 'processing'; id: string; template: string }
  | { status: 'queued'; id: string; template: string }
  | { status: 'duplicate'; id: string; messageId?: string; template: string };

export class IdempotencyConflictError extends Error {
  constructor() {
    super('The idempotency key was already used with a different payload');
    this.name = 'IdempotencyConflictError';
  }
}

export class EmailDeliveryFailedError extends Error {
  readonly retryable = false;
  constructor(readonly deliveryId: string, readonly errorCode?: string) {
    super('The email delivery failed');
    this.name = 'EmailDeliveryFailedError';
  }
}

export interface PreparedEmailDelivery {
  project: ProjectConfig;
  input: SendEmailInput;
  account: EmailAccount;
  delivery: EmailDelivery;
  message: {
    to: string | string[];
    subject: string;
    html: string;
    text: string;
    from?: { name?: string; address: string };
    replyTo?: string;
  };
}

class TestEmailAccountStore implements EmailAccountStore {
  private readonly account: EmailAccount = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'test-default',
    email: 'noreply@example.com',
    provider: SmtpProvider.PURELY_MAIL,
    credentials: { username: 'test', password: 'test' },
    active: true,
  };

  async findById(id: string): Promise<EmailAccount | null> {
    return id === this.account.id ? this.account : null;
  }

  async findByNameForProject(_projectId: string, name: string): Promise<EmailAccount | null> {
    return name === this.account.name ? this.account : null;
  }

  async findDefaultForProject(_projectId: string): Promise<EmailAccount | null> {
    return this.account;
  }

  async list(): Promise<readonly EmailAccount[]> {
    return [this.account];
  }

  async listWithProjectLinks(): Promise<readonly { account: EmailAccount; projectIds: readonly string[]; isDefaultFor: readonly string[] }[]> {
    return [{ account: this.account, projectIds: [], isDefaultFor: [] }];
  }

  async create(): Promise<EmailAccount> {
    throw new Error('Not implemented in test store');
  }

  async update(): Promise<EmailAccount> {
    throw new Error('Not implemented in test store');
  }

  async delete(): Promise<void> {
    throw new Error('Not implemented in test store');
  }

  async linkToProject(): Promise<void> {
    throw new Error('Not implemented in test store');
  }

  async unlinkFromProject(): Promise<void> {
    throw new Error('Not implemented in test store');
  }

  async setDefaultForProject(): Promise<void> {
    throw new Error('Not implemented in test store');
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  return value;
}

function payloadHash(input: SendEmailInput): string {
  return createHash('sha256').update(JSON.stringify(canonicalize({ template: input.template, to: input.to, data: input.data, sender: input.sender }))).digest('hex');
}

function deliveryId(): string {
  return `email_${randomUUID()}`;
}

export class SendEmailUseCase {
  private readonly accountResolver: EmailAccountResolver;

  constructor(
    private readonly provider: EmailProvider,
    private readonly deliveryStore: EmailDeliveryStore,
    accountStore?: EmailAccountStore,
  ) {
    if (!accountStore && process.env.NODE_ENV !== 'test') {
      throw new Error('EmailAccountStore is required outside the test environment');
    }
    this.accountResolver = new EmailAccountResolver(accountStore ?? new TestEmailAccountStore());
  }

  async execute(project: ProjectConfig, input: SendEmailInput): Promise<SendEmailResult> {
    const prepared = await this.prepare(project, input);
    if (prepared.kind === 'result') return prepared.result;
    return this.process(prepared.delivery, prepared.account, prepared.input, prepared.message);
  }

  async enqueue(project: ProjectConfig, input: SendEmailInput, queue: EmailJobQueue): Promise<SendEmailResult> {
    const prepared = await this.prepare(project, input);
    if (prepared.kind === 'result') return prepared.result;
    try {
      await queue.enqueue({ id: prepared.delivery.id, deliveryId: prepared.delivery.id, projectId: prepared.project.id, emailAccountId: prepared.account.id, template: prepared.delivery.template, message: prepared.message });
    } catch (error) {
      await this.deliveryStore.update(prepared.delivery.id, { status: 'failed', failedAt: new Date().toISOString(), errorCode: 'QUEUE_ENQUEUE_FAILED' });
      throw error;
    }
    return { status: 'queued', id: prepared.delivery.id, template: prepared.delivery.template };
  }

  private async prepare(project: ProjectConfig, input: SendEmailInput): Promise<
    | { kind: 'prepared'; delivery: EmailDelivery; project: ProjectConfig; input: SendEmailInput; account: EmailAccount; message: PreparedEmailDelivery['message'] }
    | { kind: 'result'; result: SendEmailResult }
  > {
    this.assertTemplateAccess(project, input.template);
    const account = await this.accountResolver.resolve(project.id, input.sender);
    const compiled = await compileTemplate(input.template, input.data);
    const delivery: EmailDelivery = {
      id: deliveryId(), projectId: project.id, emailAccountId: account.id, template: input.template,
      to: Array.isArray(input.to) ? input.to : [input.to], subject: compiled.subject, status: 'processing', createdAt: new Date().toISOString(),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey, payloadHash: payloadHash(input) } : {}),
    };
    const reservation = await this.deliveryStore.reserve(delivery);
    if (reservation.kind === 'existing') {
      if (reservation.delivery.payloadHash !== delivery.payloadHash) throw new IdempotencyConflictError();
      if (reservation.delivery.status === 'processing') return { kind: 'result', result: { status: 'processing', id: reservation.delivery.id, template: reservation.delivery.template } };
      if (reservation.delivery.status === 'failed') throw new EmailDeliveryFailedError(reservation.delivery.id, reservation.delivery.errorCode);
      return { kind: 'result', result: { status: 'duplicate', id: reservation.delivery.id, ...(reservation.delivery.providerMessageId ? { messageId: reservation.delivery.providerMessageId } : {}), template: reservation.delivery.template } };
    }
    return {
      kind: 'prepared', delivery, project, input, account,
      message: {
        to: input.to, subject: compiled.subject, html: compiled.html, text: compiled.text,
        from: { name: project.fromName, address: account.email },
        ...(project.replyTo ? { replyTo: project.replyTo } : {}),
      },
    };
  }

  private async process(delivery: EmailDelivery, account: EmailAccount, input: SendEmailInput, message: PreparedEmailDelivery['message']): Promise<SendEmailResult> {
    try {
      const result = await this.provider.send(account, message);
      await this.deliveryStore.update(delivery.id, { status: 'accepted', acceptedAt: new Date().toISOString(), providerMessageId: result.messageId });
      return { status: 'accepted', id: delivery.id, messageId: result.messageId, template: input.template };
    } catch (error) {
      const errorCode = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
      await this.deliveryStore.update(delivery.id, { status: 'failed', failedAt: new Date().toISOString(), ...(errorCode ? { errorCode } : {}) });
      throw new EmailDeliveryFailedError(delivery.id, errorCode);
    }
  }

  async processJob(job: EmailJob): Promise<void> {
    if (!job.emailAccountId) {
      throw new Error('Job is missing emailAccountId; legacy jobs without an account ID are not supported');
    }
    const account = await this.accountResolver.resolveById(job.emailAccountId, job.projectId);
    await this.process(
      { id: job.deliveryId, projectId: job.projectId, emailAccountId: account.id, template: job.template, to: Array.isArray(job.message.to) ? job.message.to : [job.message.to], subject: job.message.subject, status: 'processing', createdAt: new Date().toISOString() },
      account,
      { template: job.template, to: job.message.to, data: {} },
      job.message,
    );
  }

  async preview(project: ProjectConfig, input: z.infer<typeof previewEmailInputSchema>): Promise<{ subject: string; html: string; text: string }> {
    this.assertTemplateAccess(project, input.template);
    return compileTemplate(input.template, input.data);
  }

  private assertTemplateAccess(project: ProjectConfig, template: string): void {
    if (!hasTemplate(template)) throw new UnknownTemplateError(template);
    const allowsAll = project.allowedTemplates.includes('*');
    const isAllowed = project.allowedTemplates.includes(template);
    if (!allowsAll && !isAllowed) throw new TemplateNotAllowedError(template, project.id);
  }
}
