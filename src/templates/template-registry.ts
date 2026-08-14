import { createElement, type ComponentType } from 'react';
import { render } from 'react-email';
import { z, type ZodType } from 'zod';
import WelcomeUserEmail from '../../emails/welcome-user.js';
import GenericNotificationEmail from '../../emails/generic-notification.js';
import {
  SharedAccessInvitationEmail,
  SharedAccessPermissionUpdatedEmail,
  SharedAccessRevokedEmail,
  SharedAccessSuspendedEmail,
} from '../../emails/shared-access.js';

interface TemplateDefinition<T extends object> {
  schema: ZodType<T>;
  component: ComponentType<T>;
  subject: (data: T) => string;
}

function defineTemplate<T extends object>(
  definition: TemplateDefinition<T>,
): TemplateDefinition<T> {
  return definition;
}

const welcomeUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  actionUrl: z.string().url(),
}).strict();

const genericNotificationSchema = z.object({
  title: z.string().trim().min(1).max(180),
  message: z.string().trim().min(1).max(10_000),
}).strict();

const sharedAccessInvitationSchema = z.object({
  recipientName: z.string().trim().min(1).max(120),
  ownerName: z.string().trim().min(1).max(120),
  permissionLabel: z.string().trim().min(1).max(80),
  actionUrl: z.string().url(),
  expiresAt: z.string().trim().min(1).max(80),
}).strict();

const sharedAccessPermissionUpdatedSchema = z.object({
  recipientName: z.string().trim().min(1).max(120),
  ownerName: z.string().trim().min(1).max(120),
  permissionLabel: z.string().trim().min(1).max(80),
  actionUrl: z.string().url(),
}).strict();

const sharedAccessStatusSchema = z.object({
  recipientName: z.string().trim().min(1).max(120),
  ownerName: z.string().trim().min(1).max(120),
  actionUrl: z.string().url(),
}).strict();

export const templateRegistry = {
  'welcome-user': defineTemplate({
    schema: welcomeUserSchema,
    component: WelcomeUserEmail,
    subject: (data) => `Bem-vindo, ${data.name}`,
  }),
  'generic-notification': defineTemplate({
    schema: genericNotificationSchema,
    component: GenericNotificationEmail,
    subject: (data) => data.title,
  }),
  'shared-access-invitation': defineTemplate({
    schema: sharedAccessInvitationSchema,
    component: SharedAccessInvitationEmail,
    subject: (data) => `${data.ownerName} compartilhou o Bloom com você`,
  }),
  'shared-access-permission-updated': defineTemplate({
    schema: sharedAccessPermissionUpdatedSchema,
    component: SharedAccessPermissionUpdatedEmail,
    subject: () => 'Sua permissão no Bloom foi atualizada',
  }),
  'shared-access-suspended': defineTemplate({
    schema: sharedAccessStatusSchema,
    component: SharedAccessSuspendedEmail,
    subject: () => 'Seu acesso compartilhado ao Bloom foi suspenso',
  }),
  'shared-access-revoked': defineTemplate({
    schema: sharedAccessStatusSchema,
    component: SharedAccessRevokedEmail,
    subject: () => 'Seu acesso compartilhado ao Bloom foi removido',
  }),
};

export type TemplateName = keyof typeof templateRegistry;

export class UnknownTemplateError extends Error {
  constructor(template: string) {
    super(`Unknown template: ${template}`);
    this.name = 'UnknownTemplateError';
  }
}

export class InvalidTemplateSubjectError extends Error {
  constructor() {
    super('Template subjects must contain 1 to 998 characters and no line breaks');
    this.name = 'InvalidTemplateSubjectError';
  }
}

export function hasTemplate(name: string): name is TemplateName {
  return Object.prototype.hasOwnProperty.call(templateRegistry, name);
}

export async function compileTemplate(
  name: string,
  rawData: unknown,
): Promise<{ subject: string; html: string; text: string }> {
  if (!hasTemplate(name)) {
    throw new UnknownTemplateError(name);
  }

  // The registry is heterogeneous, so runtime validation is the final authority
  // for the selected template's payload.
  const definition = templateRegistry[name] as unknown as TemplateDefinition<
    Record<string, unknown>
  >;
  const data = definition.schema.parse(rawData);
  const element = createElement(definition.component, data);

  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);

  const subject = definition.subject(data).trim();
  if (!subject || subject.length > 998 || /[\r\n]/.test(subject)) {
    throw new InvalidTemplateSubjectError();
  }

  return {
    subject,
    html,
    text,
  };
}
