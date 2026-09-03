import type { EmailAccount, SmtpProvider } from '../../domain/smtp-provider.js';
import type { EmailMessage, EmailSendResult } from '../../domain/email-provider.js';

export interface SmtpAdapter {
  readonly provider: SmtpProvider;
  send(account: EmailAccount, message: EmailMessage): Promise<EmailSendResult>;
  verify(account: EmailAccount): Promise<void>;
  close(): Promise<void>;
}
