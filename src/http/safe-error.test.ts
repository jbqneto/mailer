import { describe, expect, it } from 'vitest';
import { safeErrorDetails } from './safe-error.js';

describe('safeErrorDetails', () => {
  it('keeps only safe provider error metadata', () => {
    const error = Object.assign(new Error('SMTP password must not leak'), {
      code: 'EAUTH',
      response: 'sensitive provider response',
    });

    expect(safeErrorDetails(error)).toEqual({
      errorName: 'Error',
      errorCode: 'EAUTH',
    });
  });

  it('normalizes non-Error failures', () => {
    expect(safeErrorDetails('secret')).toEqual({
      errorName: 'UnknownError',
    });
  });
});
