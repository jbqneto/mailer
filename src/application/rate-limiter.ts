export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

/** Persistence boundary for request-rate limiting. */
export interface RateLimiter {
  consume(subject: string): RateLimitDecision;
}
