import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { assertProductionValue } from '../config/production-config.js';

const adminCredentialsSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(12),
});

export type AdminCredentials = z.infer<typeof adminCredentialsSchema>;

export function loadAdminCredentials(): AdminCredentials {
  const credentials = adminCredentialsSchema.parse({
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
  });

  assertProductionValue('ADMIN_USERNAME', credentials.username);
  assertProductionValue('ADMIN_PASSWORD', credentials.password);
  return credentials;
}

interface Session {
  username: string;
  expiresAt: number;
}

interface LoginAttemptEntry {
  failures: number;
  windowStartedAt: number;
  blockedUntil?: number;
}

export class AdminLoginRateLimiter {
  private readonly attempts = new Map<string, LoginAttemptEntry>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly blockMs = 15 * 60 * 1000,
  ) {}

  canAttempt(key: string): boolean {
    this.evictExpired();
    const entry = this.getEntry(key);
    return !entry.blockedUntil || entry.blockedUntil <= Date.now();
  }

  recordFailure(key: string): void {
    const now = Date.now();
    const entry = this.getEntry(key);

    if (now - entry.windowStartedAt >= this.windowMs) {
      entry.failures = 0;
      entry.windowStartedAt = now;
      delete entry.blockedUntil;
    }

    entry.failures += 1;
    if (entry.failures >= this.maxFailures) {
      entry.blockedUntil = now + this.blockMs;
    }
  }

  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }

  retryAfterSeconds(key: string): number {
    const entry = this.getEntry(key);
    if (!entry.blockedUntil) return 0;
    return Math.max(1, Math.ceil((entry.blockedUntil - Date.now()) / 1000));
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.attempts) {
      const windowExpired = now - entry.windowStartedAt >= this.windowMs;
      const blockExpired = !entry.blockedUntil || entry.blockedUntil <= now;
      if (windowExpired && blockExpired) this.attempts.delete(key);
    }
  }

  private getEntry(key: string): LoginAttemptEntry {
    const existing = this.attempts.get(key);
    if (existing) return existing;

    const entry = {
      failures: 0,
      windowStartedAt: Date.now(),
    } satisfies LoginAttemptEntry;
    this.attempts.set(key, entry);
    return entry;
  }
}

export class AdminAuth {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly credentials: AdminCredentials,
    private readonly ttlMs = 8 * 60 * 60 * 1000,
  ) {}

  login(username: string, password: string): string | undefined {
    this.evictExpired();
    if (!safeEqual(username, this.credentials.username)) return undefined;
    if (!safeEqual(password, this.credentials.password)) return undefined;

    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, {
      username,
      expiresAt: Date.now() + this.ttlMs,
    });
    return token;
  }

  isAuthenticated(cookieHeader: string | undefined): boolean {
    this.evictExpired();
    const token = readCookie(cookieHeader, 'email_gateway_admin');
    if (!token) return false;

    const session = this.sessions.get(token);
    if (!session) return false;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return false;
    }

    return true;
  }

  revoke(cookieHeader: string | undefined): void {
    const token = readCookie(cookieHeader, 'email_gateway_admin');
    if (token) this.sessions.delete(token);
  }

  evictExpired(): void {
    const now = Date.now();
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token);
    }
  }
}

export function adminSessionCookie(token: string, secure: boolean): string {
  return [
    `email_gateway_admin=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=28800',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export const clearAdminSessionCookie = [
  'email_gateway_admin=',
  'Path=/',
  'HttpOnly',
  'SameSite=Lax',
  'Max-Age=0',
].join('; ');

function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;

  for (const cookie of cookieHeader.split(';')) {
    const [key, ...valueParts] = cookie.trim().split('=');
    if (key === name) return valueParts.join('=') || undefined;
  }

  return undefined;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
