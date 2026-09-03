import type { EmailMessage } from '../domain/email-provider.js';

export interface EmailJob {
  id: string;
  deliveryId: string;
  projectId: string;
  emailAccountId?: string;
  template: string;
  message: EmailMessage;
}

export type EmailJobHandler = (job: EmailJob) => Promise<void>;

export function isRetryableJobError(error: unknown): boolean {
  return !(error && typeof error === 'object' && 'retryable' in error && error.retryable === false);
}

export interface EmailJobQueue {
  enqueue(job: EmailJob): Promise<void>;
  start?(): void;
  close(): Promise<void>;
}
