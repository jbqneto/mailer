import { describe, expect, it } from 'vitest';
import { isRetryableSmtpError, withRetry } from './retry.js';

describe('SMTP retry policy', () => {
  it('retries transient failures with exponential delays', async () => {
    let attempts = 0;
    const delays: number[] = [];
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
        return 'sent';
      },
      { maxAttempts: 3, initialDelayMs: 10, sleep: async (delay) => { delays.push(delay); } },
    );

    expect(result).toBe('sent');
    expect(attempts).toBe(3);
    expect(delays).toEqual([10, 20]);
  });

  it('does not retry permanent provider errors', async () => {
    let attempts = 0;
    await expect(withRetry(
      async () => {
        attempts += 1;
        throw Object.assign(new Error('rejected'), { responseCode: 550 });
      },
      { maxAttempts: 3, initialDelayMs: 0, sleep: async () => {} },
    )).rejects.toThrow('rejected');

    expect(attempts).toBe(1);
  });

  it('recognizes transient SMTP response codes', () => {
    expect(isRetryableSmtpError({ responseCode: 421 })).toBe(true);
    expect(isRetryableSmtpError({ responseCode: 550 })).toBe(false);
  });
});
