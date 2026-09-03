import type { EmailMessage, EmailProvider, EmailSendResult } from '../../domain/email-provider.js';
import { SmtpProvider, type EmailAccount } from '../../domain/smtp-provider.js';
import { SmtpStrategy } from './smtp-strategy.js';
import type { SmtpAdapter } from './smtp-adapter.js';
import type { RetryOptions } from './retry.js';

export class SmtpEmailProvider implements EmailProvider {
  private readonly adapter: SmtpAdapter;

  constructor(
    provider: SmtpProvider = SmtpProvider.PURELY_MAIL,
    retryOptions: RetryOptions = { maxAttempts: 3, initialDelayMs: 250 },
  ) {
    this.adapter = SmtpStrategy.create(provider, retryOptions);
  }

  async send(account: EmailAccount, message: EmailMessage): Promise<EmailSendResult> {
    if (account.provider !== this.adapter.provider) throw new Error(`SMTP provider ${account.provider} is not supported by this gateway`);
    return this.adapter.send(account, message);
  }

  async verify(account: EmailAccount): Promise<void> {
    if (account.provider !== this.adapter.provider) throw new Error(`SMTP provider ${account.provider} is not supported by this gateway`);
    await this.adapter.verify(account);
  }

  async close(): Promise<void> {
    await this.adapter.close();
  }
}
