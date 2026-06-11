type FetchError = Error & {
  retryable?: boolean;
  retryAfterMs?: number;
  unsupportedContentType?: boolean;
};

export function retryableError(
  message: string,
  retryAfterMs?: number,
): FetchError {
  return Object.assign(new Error(message), {
    retryable: true,
    retryAfterMs,
  });
}

export function nonRetryableError(message: string): FetchError {
  return Object.assign(new Error(message), {
    retryable: false,
  });
}

export function unsupportedContentTypeError(message: string): FetchError {
  return Object.assign(new Error(message), {
    unsupportedContentType: true,
  });
}

export function isUnsupportedContentTypeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "unsupportedContentType" in error &&
    error.unsupportedContentType === true
  );
}

export function isRetryableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "retryable" in error &&
    error.retryable === true
  );
}

export function isKnownFetchError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ("retryable" in error || "unsupportedContentType" in error)
  );
}

export function getRetryDelayMs(
  error: unknown,
  backoffDelayMs: number,
): number {
  if (
    error instanceof Error &&
    "retryAfterMs" in error &&
    typeof error.retryAfterMs === "number"
  ) {
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
