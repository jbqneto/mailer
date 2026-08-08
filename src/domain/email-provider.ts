import type { ProjectConfig } from './project.js';

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

export interface EmailSendResult {
  messageId: string;
}

export interface EmailProvider {
  send(project: ProjectConfig, message: EmailMessage): Promise<EmailSendResult>;
  verify?(project: ProjectConfig): Promise<void>;
  close?(): Promise<void>;
}
