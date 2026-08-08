import { afterEach, describe, expect, it } from 'vitest';
import { assertProductionValue } from './production-config.js';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

describe('assertProductionValue', () => {
  it('rejects obvious placeholders in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() =>
      assertProductionValue('SMTP_PASSWORD', 'REPLACE_WITH_PASSWORD'),
    ).toThrow('SMTP_PASSWORD must be replaced before production startup');
  });

  it('allows configured Purelymail values in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() =>
      assertProductionValue('SMTP_HOST', 'smtp.purelymail.com'),
    ).not.toThrow();
  });
});
