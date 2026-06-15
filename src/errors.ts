export class RetryableFetchError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "RetryableFetchError";
  }
}

export class NonRetryableFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableFetchError";
  }
}

export class UnsupportedContentTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedContentTypeError";
  }
}

export function retryableError(
  message: string,
  retryAfterMs?: number,
): RetryableFetchError {
  return new RetryableFetchError(message, retryAfterMs);
}

export function nonRetryableError(message: string): NonRetryableFetchError {
  return new NonRetryableFetchError(message);
}

export function unsupportedContentTypeError(
  message: string,
): UnsupportedContentTypeError {
  return new UnsupportedContentTypeError(message);
}

export function isUnsupportedContentTypeError(error: unknown): boolean {
  return error instanceof UnsupportedContentTypeError;
}

export function isRetryableError(error: unknown): boolean {
  return error instanceof RetryableFetchError;
}

export function isKnownFetchError(error: unknown): boolean {
  return (
    error instanceof RetryableFetchError ||
    error instanceof NonRetryableFetchError ||
    error instanceof UnsupportedContentTypeError
  );
}

export function getRetryDelayMs(
  error: unknown,
  backoffDelayMs: number,
): number {
  if (error instanceof RetryableFetchError && error.retryAfterMs !== undefined) {
    return Math.max(backoffDelayMs, error.retryAfterMs);
  }

  return backoffDelayMs;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
