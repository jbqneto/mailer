import type { RateLimitDecision, RateLimiter } from '../../application/rate-limiter.js';

interface WindowEntry {
  count: number;
  resetAt: number;
}

export interface InMemoryRateLimiterOptions {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly entries = new Map<string, WindowEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(options: InMemoryRateLimiterOptions = {}) {
    this.maxRequests = options.maxRequests ?? 60;
    this.windowMs = options.windowMs ?? 60_000;
    this.now = options.now ?? Date.now;

    if (!Number.isInteger(this.maxRequests) || this.maxRequests < 1) {
      throw new Error('Rate limit maxRequests must be a positive integer');
    }
    if (!Number.isInteger(this.windowMs) || this.windowMs < 1) {
      throw new Error('Rate limit windowMs must be a positive integer');
    }
  }

  consume(subject: string): RateLimitDecision {
    const now = this.now();
    this.removeExpired(now);
    const current = this.entries.get(subject);
    const entry = current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + this.windowMs };

    entry.count += 1;
    this.entries.set(subject, entry);
    const allowed = entry.count <= this.maxRequests;
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    return {
      allowed,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - entry.count),
      resetAt: entry.resetAt,
      retryAfterSeconds,
    };
  }

  private removeExpired(now: number): void {
    for (const [subject, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(subject);
    }
  }
}
