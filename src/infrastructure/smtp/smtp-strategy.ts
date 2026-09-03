import type { SmtpProvider } from '../../domain/smtp-provider.js';
import type { SmtpAdapter } from './smtp-adapter.js';
import { PurelyMailSmtpAdapter } from './providers/purelymail-smtp-adapter.js';

export class UnsupportedSmtpProviderError extends Error {
  constructor(provider: SmtpProvider) {
    super(`Unsupported SMTP provider: ${provider}`);
    this.name = 'UnsupportedSmtpProviderError';
  }
}

export interface SmtpStrategyOptions {
  maxAttempts: number;
  initialDelayMs: number;
}

export class SmtpStrategy {
  static create(provider: SmtpProvider, options: SmtpStrategyOptions): SmtpAdapter {
    switch (provider) {
      case 'PURELY_MAIL':
        return new PurelyMailSmtpAdapter(options);
      default:
        throw new UnsupportedSmtpProviderError(provider);
    }
  }
}
