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
      return {
        status: 'duplicate',
        id: reservation.delivery.id,
        ...(reservation.delivery.providerMessageId
          ? { messageId: reservation.delivery.providerMessageId }
          : {}),
        template: reservation.delivery.template,
      };
    }

    try {

      const result = await this.provider.send(project, {
        to: input.to,
        subject: compiled.subject,
        html: compiled.html,
        text: compiled.text,
      });

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
      if (input.idempotencyKey) await this.deliveryStore.releaseIdempotency(project.id, input.idempotencyKey, delivery.id);

      throw error;
    }
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
