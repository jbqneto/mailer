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

export interface EmailProvider {
  send(account: EmailAccount, message: EmailMessage): Promise<EmailSendResult>;
  verify?(account: EmailAccount): Promise<void>;
  close?(): Promise<void>;
}
