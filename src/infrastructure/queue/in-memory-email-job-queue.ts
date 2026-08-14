import {
  EmailJob,
  EmailJobHandler,
  EmailJobQueue,
  isRetryableJobError,
} from '../../application/email-job-queue.js';

interface PendingJob {
  job: EmailJob;
  attempts: number;
  availableAt: number;
}

export interface InMemoryEmailJobQueueOptions {
  concurrency?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  handler: EmailJobHandler;
  onJobError?: (job: EmailJob, error: unknown) => void;
  now?: () => number;
}

export class InMemoryEmailJobQueue implements EmailJobQueue {
  private readonly pending: PendingJob[] = [];
  private readonly running = new Set<Promise<void>>();
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly handler: EmailJobHandler;
  private readonly onJobError: (job: EmailJob, error: unknown) => void;
  private readonly now: () => number;
  private wakeTimer: ReturnType<typeof setTimeout> | undefined;
  private closing = false;

  constructor(options: InMemoryEmailJobQueueOptions) {
    this.concurrency = options.concurrency ?? 2;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 250;
    this.handler = options.handler;
    this.onJobError = options.onJobError ?? (() => undefined);
    this.now = options.now ?? Date.now;

    if (!Number.isInteger(this.concurrency) || this.concurrency < 1) {
      throw new Error('Queue concurrency must be a positive integer');
    }
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error('Queue maxAttempts must be a positive integer');
    }
    if (!Number.isInteger(this.retryDelayMs) || this.retryDelayMs < 0) {
      throw new Error('Queue retryDelayMs must be a non-negative integer');
    }
  }

  async enqueue(job: EmailJob): Promise<void> {
    if (this.closing) throw new Error('Email job queue is closing');
    this.pending.push({ job, attempts: 0, availableAt: this.now() });
    this.pump();
  }

  start(): void {
    this.pump();
  }

  async close(): Promise<void> {
    this.closing = true;
    while (this.pending.length > 0 || this.running.size > 0) {
      this.pump();
      if (this.running.size > 0) {
        await Promise.all([...this.running]);
      } else if (this.pending.length > 0) {
        const waitMs = Math.max(0, Math.min(...this.pending.map((entry) => entry.availableAt - this.now())));
        if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      }
    }
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  get activeCount(): number {
    return this.running.size;
  }

  private pump(): void {
    const now = this.now();
    while (this.running.size < this.concurrency) {
      const index = this.pending.findIndex((entry) => entry.availableAt <= now);
      if (index < 0) break;
      const [entry] = this.pending.splice(index, 1);
      if (!entry) break;
      entry.attempts += 1;

      const running = this.handler(entry.job)
        .catch((error) => {
          if (entry.attempts >= this.maxAttempts || !isRetryableJobError(error)) {
            this.onJobError(entry.job, error);
            return;
          }
          entry.availableAt = this.now() + this.retryDelayMs * 2 ** (entry.attempts - 1);
          this.pending.push(entry);
        })
        .finally(() => {
          this.running.delete(running);
          this.pump();
        });
      this.running.add(running);
    }

    const nextAt = this.pending.reduce<number | undefined>(
      (next, entry) => next === undefined ? entry.availableAt : Math.min(next, entry.availableAt),
      undefined,
    );
    if (nextAt !== undefined && this.wakeTimer === undefined) {
      this.wakeTimer = setTimeout(() => {
        this.wakeTimer = undefined;
        this.pump();
      }, Math.max(0, nextAt - this.now()));
    }
  }
}
