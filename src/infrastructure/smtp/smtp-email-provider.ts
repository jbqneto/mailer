import nodemailer, { type Transporter } from 'nodemailer';
import type {
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from '../../domain/email-provider.js';
import type { ProjectConfig } from '../../domain/project.js';
import { withRetry, type RetryOptions } from './retry.js';

export class SmtpEmailProvider implements EmailProvider {
  private readonly transporters = new Map<string, Transporter>();

  constructor(private readonly retryOptions: RetryOptions = {
    maxAttempts: 3,
    initialDelayMs: 250,
  }) {}

  async send(
    project: ProjectConfig,
    message: EmailMessage,
  ): Promise<EmailSendResult> {
    const transporter = this.getTransporter(project);

    const info = await withRetry(
      () => transporter.sendMail({
        from: {
          name: project.fromName,
          address: project.fromEmail,
        },
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(project.replyTo ? { replyTo: project.replyTo } : {}),
      }),
      this.retryOptions,
    );

    return {
      messageId: info.messageId,
    };
  }

  async verify(project: ProjectConfig): Promise<void> {
    await this.getTransporter(project).verify();
  }

  async close(): Promise<void> {
    const closeOperations = [...this.transporters.values()].map((transporter) =>
      transporter.close(),
    );

    await Promise.all(closeOperations);
    this.transporters.clear();
  }

  private getTransporter(project: ProjectConfig): Transporter {
    const existing = this.transporters.get(project.id);
    if (existing) {
      return existing;
    }

    const transporter = nodemailer.createTransport({
      host: project.smtp.host,
      port: project.smtp.port,
      secure: project.smtp.secure,
      ...(project.smtp.auth
        ? {
            auth: {
              user: project.smtp.auth.user,
              pass: project.smtp.auth.password,
            },
          }
        : {}),
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });

    this.transporters.set(project.id, transporter);
    return transporter;
  }
}
