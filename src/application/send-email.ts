import { z } from 'zod';
import type { EmailProvider } from '../domain/email-provider.js';
import type { ProjectConfig } from '../domain/project.js';
import {
  compileTemplate,
  hasTemplate,
  UnknownTemplateError,
} from '../templates/template-registry.js';
import { createHash, randomUUID } from 'node:crypto';
import type { EmailDelivery, EmailDeliveryStore } from '../domain/email-delivery.js';
import type { EmailJobQueue } from './email-job-queue.js';

export const sendEmailInputSchema = z
  .object({
    template: z.string().trim().min(1).max(120),
    to: z.union([
      z.string().email(),
      z.array(z.string().email()).min(1).max(20),
    ]),
    data: z.record(z.string(), z.unknown()).default({}),
    idempotencyKey: z.string().trim().min(1).max(256).optional(),
  })
  .strict();

export const previewEmailInputSchema = z
  .object({
    template: z.string().trim().min(1).max(120),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type SendEmailInput = z.infer<typeof sendEmailInputSchema>;

export class TemplateNotAllowedError extends Error {
  constructor(template: string, projectId: string) {
    super(`Template "${template}" is not allowed for project "${projectId}"`);
    this.name = 'TemplateNotAllowedError';
  }
}

export type SendEmailResult =
  | {
      status: 'accepted';
      id: string;
      messageId: string;
      template: string;
    }
  | {
      status: 'processing';
      id: string;
      template: string;
    }
  | {
      status: 'queued';
      id: string;
      template: string;
    }
  | {
      status: 'duplicate';
      id: string;
      messageId?: string;
      template: string;
    };

export class IdempotencyConflictError extends Error {
  constructor() {
    super('The idempotency key was already used with a different payload');
    this.name = 'IdempotencyConflictError';
  }
}

export class EmailDeliveryFailedError extends Error {
  readonly retryable = false;

  constructor(
    readonly deliveryId: string,
    readonly errorCode?: string,
  ) {
    super('The email delivery failed');
    this.name = 'EmailDeliveryFailedError';
  }
}

export interface PreparedEmailDelivery {
  project: ProjectConfig;
  input: SendEmailInput;
  delivery: EmailDelivery;
  message: {
    to: string | string[];
    subject: string;
    html: string;
    text: string;
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function payloadHash(input: SendEmailInput): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize({ template: input.template, to: input.to, data: input.data })))
    .digest('hex');
}

function deliveryId(): string {
  return `email_${randomUUID()}`;
}

export class SendEmailUseCase {
  constructor(
    private readonly provider: EmailProvider,
    private readonly deliveryStore: EmailDeliveryStore,
  ) {}

  async execute(
    project: ProjectConfig,
    input: SendEmailInput,
  ): Promise<SendEmailResult> {
    const prepared = await this.prepare(project, input);
    if (prepared.kind === 'result') return prepared.result;
    return this.process(prepared.delivery, prepared.project, prepared.input, prepared.message);
  }

  async enqueue(
    project: ProjectConfig,
    input: SendEmailInput,
    queue: EmailJobQueue,
  ): Promise<SendEmailResult> {
    const prepared = await this.prepare(project, input);
    if (prepared.kind === 'result') return prepared.result;

    try {
      await queue.enqueue({
        id: prepared.delivery.id,
        deliveryId: prepared.delivery.id,
        projectId: prepared.project.id,
        template: prepared.delivery.template,
        message: prepared.message,
      });
    } catch (error) {
      await this.deliveryStore.update(prepared.delivery.id, {
        status: 'failed',
        failedAt: new Date().toISOString(),
        errorCode: 'QUEUE_ENQUEUE_FAILED',
      });
      throw error;
    }

    return {
      status: 'queued',
      id: prepared.delivery.id,
      template: prepared.delivery.template,
    };
  }

  private async prepare(
    project: ProjectConfig,
    input: SendEmailInput,
  ): Promise<
    | { kind: 'prepared'; delivery: EmailDelivery; project: ProjectConfig; input: SendEmailInput; message: PreparedEmailDelivery['message'] }
    | { kind: 'result'; result: SendEmailResult }
  > {
    this.assertTemplateAccess(project, input.template);

    const compiled = await compileTemplate(input.template, input.data);
    const delivery: EmailDelivery = {
      id: deliveryId(),
      projectId: project.id,
      template: input.template,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: compiled.subject,
      status: 'processing',
      createdAt: new Date().toISOString(),
      ...(input.idempotencyKey
        ? { idempotencyKey: input.idempotencyKey, payloadHash: payloadHash(input) }
        : {}),
    };
    const reservation = await this.deliveryStore.reserve(delivery);

    if (reservation.kind === 'existing') {
      if (reservation.delivery.payloadHash !== delivery.payloadHash) {
        throw new IdempotencyConflictError();
      }
      if (reservation.delivery.status === 'processing') {
        return {
          kind: 'result',
          result: {
            status: 'processing',
            id: reservation.delivery.id,
            template: reservation.delivery.template,
          },
        };
      }
      if (reservation.delivery.status === 'failed') {
        throw new EmailDeliveryFailedError(
          reservation.delivery.id,
          reservation.delivery.errorCode,
        );
      }
      return {
        kind: 'result',
        result: {
          status: 'duplicate',
          id: reservation.delivery.id,
          ...(reservation.delivery.providerMessageId
            ? { messageId: reservation.delivery.providerMessageId }
            : {}),
          template: reservation.delivery.template,
        },
      };
    }

    return {
      kind: 'prepared',
      delivery,
      project,
      input,
      message: {
        to: input.to,
        subject: compiled.subject,
        html: compiled.html,
        text: compiled.text,
      },
    };
  }

  private async process(
    delivery: EmailDelivery,
    project: ProjectConfig,
    input: SendEmailInput,
    message: PreparedEmailDelivery['message'],
  ): Promise<SendEmailResult> {
    try {
      const result = await this.provider.send(project, message);

      await this.deliveryStore.update(delivery.id, {
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
        providerMessageId: result.messageId,
      });

      return {
        status: 'accepted',
        id: delivery.id,
        messageId: result.messageId,
        template: input.template,
      };
    } catch (error) {
      const errorCode = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
      await this.deliveryStore.update(delivery.id, {
        status: 'failed',
        failedAt: new Date().toISOString(),
        ...(errorCode ? { errorCode } : {}),
      });

      // Keep the idempotency reservation after a provider failure. A retry
      // cannot know whether the provider accepted the message before timing
      // out, so automatically sending again could create a duplicate.
      throw new EmailDeliveryFailedError(delivery.id, errorCode);
    }
  }

  async processJob(
    job: import('./email-job-queue.js').EmailJob,
    project: ProjectConfig,
  ): Promise<void> {
    await this.process(
      {
        id: job.deliveryId,
        projectId: job.projectId,
        template: job.template,
        to: Array.isArray(job.message.to) ? job.message.to : [job.message.to],
        subject: job.message.subject,
        status: 'processing',
        createdAt: new Date().toISOString(),
      },
      project,
      {
        template: job.template,
        to: job.message.to,
        data: {},
      },
      job.message,
    );
  }

  async preview(
    project: ProjectConfig,
    input: z.infer<typeof previewEmailInputSchema>,
  ): Promise<{ subject: string; html: string; text: string }> {
    this.assertTemplateAccess(project, input.template);
    return compileTemplate(input.template, input.data);
  }

  private assertTemplateAccess(project: ProjectConfig, template: string): void {
    if (!hasTemplate(template)) {
      throw new UnknownTemplateError(template);
    }

    const allowsAll = project.allowedTemplates.includes('*');
    const isAllowed = project.allowedTemplates.includes(template);

    if (!allowsAll && !isAllowed) {
      throw new TemplateNotAllowedError(template, project.id);
    }
  }
}
