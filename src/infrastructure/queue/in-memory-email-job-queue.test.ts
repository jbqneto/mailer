import { describe, expect, it } from 'vitest';
import { InMemoryEmailJobQueue } from './in-memory-email-job-queue.js';

describe('InMemoryEmailJobQueue', () => {
  it('processes jobs in the background and drains them on close', async () => {
    let release!: () => void;
    const started = new Promise<void>((resolve) => { release = resolve; });
    let completed = false;
    const queue = new InMemoryEmailJobQueue({ concurrency: 1, handler: async () => {
      await started;
      completed = true;
    } });

    await queue.enqueue({
      id: 'job-1',
      deliveryId: 'delivery-1',
      projectId: 'project-1',
      emailAccountId: 'acc-1',
      template: 'welcome-user',
      message: { to: 'user@example.com', subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' },
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(queue.activeCount).toBe(1);
    expect(completed).toBe(false);

    release();
    await queue.close();
    expect(completed).toBe(true);
    expect(queue.pendingCount).toBe(0);
    expect(queue.activeCount).toBe(0);
  });

  it('reports job failures without stopping later jobs', async () => {
    const failures: string[] = [];
    const completed: string[] = [];
    const queue = new InMemoryEmailJobQueue({
      concurrency: 1,
      handler: async (job) => {
        if (job.id === 'job-failed') throw new Error('failed');
        completed.push(job.id);
      },
      onJobError: (job) => failures.push(job.id),
    });

    const baseJob = {
      deliveryId: 'delivery-1', projectId: 'project-1', template: 'welcome-user', emailAccountId: 'acc-1',
      message: { to: 'user@example.com', subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' },
    };
    await queue.enqueue({ ...baseJob, id: 'job-failed' });
    await queue.enqueue({ ...baseJob, id: 'job-ok', deliveryId: 'delivery-2' });
    await queue.close();

    expect(failures).toEqual(['job-failed']);
    expect(completed).toEqual(['job-ok']);
  });

  it('retries a recoverable job with exponential backoff before failing it', async () => {
    let attempts = 0;
    const failures: string[] = [];
    const queue = new InMemoryEmailJobQueue({
      concurrency: 1,
      maxAttempts: 3,
      retryDelayMs: 0,
      handler: async () => {
        attempts += 1;
        throw new Error('temporary worker failure');
      },
      onJobError: (job) => failures.push(job.id),
    });

    await queue.enqueue({
      id: 'job-retry',
      deliveryId: 'delivery-retry',
      projectId: 'project-1',
      emailAccountId: 'acc-1',
      template: 'welcome-user',
      message: { to: 'user@example.com', subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' },
    });
    await queue.close();

    expect(attempts).toBe(3);
    expect(failures).toEqual(['job-retry']);
  });
});
