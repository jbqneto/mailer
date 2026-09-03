import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailMessage, EmailSendResult } from '../../../domain/email-provider.js';
import { SmtpProvider, type EmailAccount } from '../../../domain/smtp-provider.js';
import { withRetry, type RetryOptions } from '../retry.js';
import type { SmtpAdapter } from '../smtp-adapter.js';

export interface PurelyMailSmtpAdapterOptions {
  maxAttempts: number;
  initialDelayMs: number;
}

export class PurelyMailSmtpAdapter implements SmtpAdapter {
  readonly provider = SmtpProvider.PURELY_MAIL;
  private readonly transporters = new Map<string, Transporter>();

  constructor(private readonly retryOptions: PurelyMailSmtpAdapterOptions) {}

  async send(account: EmailAccount, message: EmailMessage): Promise<EmailSendResult> {
    const info = await withRetry(
      () => this.getTransporter(account).sendMail({
        from: message.from ?? account.email,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      }),
      this.retryOptions,
    );
    return { messageId: info.messageId };
  }

  async verify(account: EmailAccount): Promise<void> {
    await this.getTransporter(account).verify();
  }

  async close(): Promise<void> {
    await Promise.all([...this.transporters.values()].map((transporter) => transporter.close()));
    this.transporters.clear();
  }

  private getTransporter(account: EmailAccount): Transporter {
    const existing = this.transporters.get(account.id);
    if (existing) return existing;
    const transporter = nodemailer.createTransport({
      host: 'smtp.purelymail.com',
      port: 465,
      secure: true,
      auth: { user: account.credentials.username, pass: account.credentials.password },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    this.transporters.set(account.id, transporter);
    return transporter;
  }
}
