export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const transientErrorCodes = new Set([
  'ECONNECTION',
  'ECONNRESET',
  'ETIMEDOUT',
  'ESOCKET',
  'EAI_AGAIN',
]);

export function isRetryableSmtpError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { code?: unknown; responseCode?: unknown };
  if (typeof candidate.code === 'string' && transientErrorCodes.has(candidate.code)) {
    return true;
  }

  return typeof candidate.responseCode === 'number' &&
    candidate.responseCode >= 400 &&
    candidate.responseCode < 500;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
  shouldRetry: (error: unknown) => boolean = isRetryableSmtpError,
): Promise<T> {
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));

  let attempt = 1;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= options.maxAttempts || !shouldRetry(error)) throw error;
      await sleep(options.initialDelayMs * 2 ** (attempt - 1));
      attempt += 1;
    }
  }
}
