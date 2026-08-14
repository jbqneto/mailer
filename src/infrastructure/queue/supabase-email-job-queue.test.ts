import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseEmailJobQueue } from './supabase-email-job-queue.js';

const jobRow = {
  id: 'job-1',
  delivery_id: 'delivery-1',
  project_id: 'project-1',
  template: 'welcome-user',
  message: {
    to: 'user@example.com',
    subject: 'Welcome',
    html: '<p>Welcome</p>',
    text: 'Welcome',
  },
  attempts: 1,
  max_attempts: 3,
  status: 'processing' as const,
};

function fakeClient(options: {
  claimedRows: typeof jobRow[];
  updates: Array<{ id: string; values: Record<string, unknown> }>;
  claims: Array<Record<string, unknown>>;
}): SupabaseClient {
  return {
    schema: () => ({
      rpc: async (_name: string, params: Record<string, unknown>) => {
        options.claims.push(params);
        const rows = options.claimedRows.splice(0, options.claimedRows.length > 1 ? 1 : options.claimedRows.length);
        return { data: rows, error: null };
      },
      from: () => ({
        insert: async () => ({ error: null }),
        update: (values: Record<string, unknown>) => ({
          eq: async (_column: string, id: string) => {
            options.updates.push({ id, values });
            return { error: null };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('SupabaseEmailJobQueue', () => {
  it('claims an expired lease and completes the recovered job', async () => {
    const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
    const claims: Array<Record<string, unknown>> = [];
    let handled = false;
    const queue = new SupabaseEmailJobQueue({
      client: fakeClient({ claimedRows: [jobRow], updates, claims }),
      handler: async () => { handled = true; },
      workerId: 'worker-test',
      pollIntervalMs: 5,
      leaseSeconds: 60,
    });

    queue.start();
    for (let attempt = 0; attempt < 20 && !handled; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await queue.close();

    expect(handled).toBe(true);
    expect(claims[0]).toMatchObject({ p_worker_id: 'worker-test', p_limit: 2, p_lease_seconds: 60 });
    expect(updates).toContainEqual({
      id: 'job-1',
      values: { status: 'completed', locked_until: null, locked_by: null },
    });
  });

  it('persists retry scheduling and eventually marks an exhausted job failed', async () => {
    const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
    const claims: Array<Record<string, unknown>> = [];
    let handledAttempts = 0;
    const queue = new SupabaseEmailJobQueue({
      client: fakeClient({ claimedRows: [jobRow, { ...jobRow, attempts: 2 }, { ...jobRow, attempts: 3 }], updates, claims }),
      handler: async () => {
        handledAttempts += 1;
        throw new Error('temporary worker failure');
      },
      pollIntervalMs: 5,
      retryDelayMs: 0,
    });

    queue.start();
    for (let attempt = 0; attempt < 20 && handledAttempts < 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await queue.close();

    expect(handledAttempts).toBe(3);
    expect(updates.some((update) => update.values.status === 'queued')).toBe(true);
    expect(updates.some((update) => update.values.status === 'failed')).toBe(true);
  });
});
