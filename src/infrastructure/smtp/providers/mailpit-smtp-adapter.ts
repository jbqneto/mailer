import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailMessage, EmailSendResult } from '../../../domain/email-provider.js';
import { SmtpProvider, type EmailAccount } from '../../../domain/smtp-provider.js';
import type { SmtpAdapter } from '../smtp-adapter.js';

export class MailpitSmtpAdapter implements SmtpAdapter {
  readonly provider = SmtpProvider.MAILPIT;
  private transporter: Transporter | undefined;

  async send(account: EmailAccount, message: EmailMessage): Promise<EmailSendResult> {
    const info = await this.getTransporter().sendMail({
      from: message.from ?? account.email,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
    return { messageId: info.messageId };
  }

  async verify(): Promise<void> {
    await this.getTransporter().verify();
  }

  async close(): Promise<void> {
    this.transporter?.close();
    this.transporter = undefined;
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    this.transporter = nodemailer.createTransport({
      host: 'localhost',
      port: 1025,
      secure: false,
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    return this.transporter;
  }
}
