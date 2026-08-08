export interface SafeErrorDetails {
  errorName: string;
  errorCode?: string;
}

export function safeErrorDetails(error: unknown): SafeErrorDetails {
  if (!(error instanceof Error)) {
    return { errorName: 'UnknownError' };
  }

  const maybeCode = 'code' in error ? error.code : undefined;
  return {
    errorName: error.name || 'Error',
    ...(typeof maybeCode === 'string' ? { errorCode: maybeCode } : {}),
  };
}
