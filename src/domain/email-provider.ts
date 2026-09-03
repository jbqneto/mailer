import type { ProjectConfig } from './project.js';
import type { EmailAccount } from './smtp-provider.js';

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  from?: {
    name?: string;
    address: string;
  };
  replyTo?: string;
}

export interface EmailSendResult {
  messageId: string;
}

/**
 * EmailAccount is the production contract. ProjectConfig is retained only as
 * a source-compatible type for existing test doubles during the migration.
 */
export interface EmailProvider {
  send(account: EmailAccount | ProjectConfig, message: EmailMessage): Promise<EmailSendResult>;
  verify?(account: EmailAccount | ProjectConfig): Promise<void>;
  close?(): Promise<void>;
}
