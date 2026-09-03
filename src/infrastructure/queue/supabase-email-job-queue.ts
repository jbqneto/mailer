import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailJob, EmailJobHandler, EmailJobQueue } from '../../application/email-job-queue.js';

interface JobRow {
  id: string;
  delivery_id: string;
  project_id: string;
  email_account_id: string;
  template: string;
  message: unknown;
  attempts: number;
  max_attempts: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
}

function fromRow(row: JobRow): EmailJob {
  if (!row.message || typeof row.message !== 'object') throw new Error(`Invalid message stored for email job ${row.id}`);
  const message = row.message as Record<string, unknown>;
  const recipients = message.to;
  if (typeof message.subject !== 'string' || typeof message.html !== 'string' || typeof message.text !== 'string') throw new Error(`Invalid message fields stored for email job ${row.id}`);
  if (typeof recipients !== 'string' && (!Array.isArray(recipients) || !recipients.every((item) => typeof item === 'string'))) throw new Error(`Invalid recipients stored for email job ${row.id}`);

  return {
    id: row.id,
    deliveryId: row.delivery_id,
    projectId: row.project_id,
    emailAccountId: row.email_account_id,
    template: row.template,
    message: {
      to: recipients,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.from && typeof message.from === 'object' ? { from: message.from as { name?: string; address: string } } : {}),
      ...(typeof message.replyTo === 'string' ? { replyTo: message.replyTo } : {}),
    },
  };
}

export interface SupabaseEmailJobQueueOptions {
  client: SupabaseClient;
  handler: EmailJobHandler;
  schema?: string;
  table?: string;
  claimFunction?: string;
  workerId?: string;
  concurrency?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  leaseSeconds?: number;
  pollIntervalMs?: number;
  onJobError?: (job: EmailJob, error: unknown) => void;
  onPollError?: (error: unknown) => void;
}

export class SupabaseEmailJobQueue implements EmailJobQueue {
  private readonly client: SupabaseClient;
  private readonly handler: EmailJobHandler;
  private readonly schema: string;
  private readonly table: string;
  private readonly claimFunction: string;
  private readonly workerId: string;
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly leaseSeconds: number;
  private readonly pollIntervalMs: number;
  private readonly onJobError: (job: EmailJob, error: unknown) => void;
  private readonly onPollError: (error: unknown) => void;
  private running = false;
  private loopPromise: Promise<void> | undefined;

  constructor(options: SupabaseEmailJobQueueOptions) {
    this.client = options.client;
    this.handler = options.handler;
    this.schema = options.schema ?? 'email_gateway';
    this.table = options.table ?? 'email_jobs';
    this.claimFunction = options.claimFunction ?? 'claim_email_jobs';
    this.workerId = options.workerId ?? `worker_${randomUUID()}`;
    this.concurrency = options.concurrency ?? 2;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1_000;
    this.leaseSeconds = options.leaseSeconds ?? 120;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.onJobError = options.onJobError ?? (() => undefined);
    this.onPollError = options.onPollError ?? (() => undefined);
    if (!Number.isInteger(this.concurrency) || this.concurrency < 1) throw new Error('Queue concurrency must be a positive integer');
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) throw new Error('Queue maxAttempts must be a positive integer');
    if (!Number.isInteger(this.retryDelayMs) || this.retryDelayMs < 0) throw new Error('Queue retryDelayMs must be a non-negative integer');
    if (!Number.isInteger(this.leaseSeconds) || this.leaseSeconds < 1) throw new Error('Queue leaseSeconds must be a positive integer');
    if (!Number.isInteger(this.pollIntervalMs) || this.pollIntervalMs < 1) throw new Error('Queue pollIntervalMs must be a positive integer');
  }

  async enqueue(job: EmailJob): Promise<void> {
    const { error } = await this.client.schema(this.schema).from(this.table).insert({
      id: job.id,
      delivery_id: job.deliveryId,
      project_id: job.projectId,
      email_account_id: job.emailAccountId,
      template: job.template,
      message: job.message,
      status: 'queued',
      attempts: 0,
      max_attempts: this.maxAttempts,
      available_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Could not enqueue email job: ${error.message}`);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.runLoop();
  }

  async close(): Promise<void> {
    this.running = false;
    await this.loopPromise;
    this.loopPromise = undefined;
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        const processed = await this.pollOnce();
        if (processed === 0) await this.sleep(this.pollIntervalMs);
      } catch (error) {
        this.onPollError(error);
        await this.sleep(this.pollIntervalMs);
      }
    }
  }

  private async pollOnce(): Promise<number> {
    const { data, error } = await this.client.schema(this.schema).rpc(this.claimFunction, {
      p_worker_id: this.workerId,
      p_limit: this.concurrency,
      p_lease_seconds: this.leaseSeconds,
    });
    if (error) throw new Error(`Could not claim email jobs: ${error.message}`);
    const rows = data as JobRow[] | null ?? [];
    const jobs = rows.map(fromRow);
    await Promise.all(jobs.map((job, index) => this.processClaimedJob(job, rows[index]?.attempts ?? 1)));
    return jobs.length;
  }

  private async processClaimedJob(job: EmailJob, attempts: number): Promise<void> {
    try {
      await this.handler(job);
      await this.update(job.id, { status: 'completed', locked_until: null, locked_by: null });
    } catch (error) {
      if (attempts >= this.maxAttempts || !isRetryableQueueError(error)) {
        await this.update(job.id, { status: 'failed', locked_until: null, locked_by: null, last_error: safeJobError(error) });
        this.onJobError(job, error);
        return;
      }
      const delay = this.retryDelayMs * 2 ** (attempts - 1);
      await this.update(job.id, { status: 'queued', available_at: new Date(Date.now() + delay).toISOString(), locked_until: null, locked_by: null, last_error: safeJobError(error) });
    }
  }

  private async update(id: string, values: Record<string, unknown>): Promise<void> {
    const { error } = await this.client.schema(this.schema).from(this.table).update(values).eq('id', id);
    if (error) throw new Error(`Could not update email job: ${error.message}`);
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}

function isRetryableQueueError(error: unknown): boolean {
  return !(error && typeof error === 'object' && 'retryable' in error && error.retryable === false);
}

function safeJobError(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
    const code = 'errorCode' in error && typeof error.errorCode === 'string' ? `:${error.errorCode}` : '';
    return `${error.name}${code}`;
  }
  return 'UnknownJobError';
}
