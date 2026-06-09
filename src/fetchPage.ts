export type FetchedPage = {
  requestedUrl: string;
  finalUrl: string;
  html: string;
  redirectChain?: string[];
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 20;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

export type FetchPageOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  isAllowedRedirect?: (url: string) => boolean;
  onRateLimited?: (cooldownMs: number) => void;
};

export async function fetchPage(
  url: string,
  options: FetchPageOptions = {},
): Promise<FetchedPage> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryBaseDelayMs =
    options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fetchPageOnce(url, options);
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === maxRetries) {
        throw error;
      }

      await delay(getRetryDelayMs(error, retryBaseDelayMs * 2 ** attempt));
    }
  }

  throw lastError;
}

async function fetchPageOnce(
  url: string,
  options: FetchPageOptions,
): Promise<FetchedPage> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const requestedUrl = new URL(url).toString();
  const redirectChain = [requestedUrl];
  const redirectChainSeen = new Set(redirectChain);
  let currentUrl = requestedUrl;

  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
      });

      if (!REDIRECT_STATUSES.has(response.status)) {
        if (!response.ok) {
          const rateLimitCooldownMs =
            response.status === 429
              ? getRateLimitCooldownMs(response.headers)
              : undefined;

          if (rateLimitCooldownMs !== undefined) {
            options.onRateLimited?.(rateLimitCooldownMs);
          }

          throw new FetchPageError(
            `Failed to fetch ${currentUrl}: ${response.status} ${response.statusText}`,
            RETRYABLE_HTTP_STATUSES.has(response.status),
            rateLimitCooldownMs,
          );
        }

        const contentType = response.headers.get("content-type");

        if (!isHtmlContentType(contentType)) {
          throw new FetchPageError(
            `Unsupported content type for ${currentUrl}: ${contentType ?? "missing"}`,
            false,
          );
        }

        return {
          requestedUrl,
          finalUrl: currentUrl,
          html: await response.text(),
          redirectChain,
        };
      }

      if (redirectCount === maxRedirects) {
        throw new FetchPageError(
          `Too many redirects fetching ${requestedUrl}`,
          false,
        );
      }

      const location = response.headers.get("location");

      if (!location || location.trim() === "") {
        throw new FetchPageError(
          `Redirect from ${currentUrl} is missing a Location header`,
          false,
        );
      }

      const nextUrl = new URL(location, currentUrl).toString();

      if (options.isAllowedRedirect && !options.isAllowedRedirect(nextUrl)) {
        throw new FetchPageError(
          `Redirect target is outside the crawl boundary: ${nextUrl}`,
          false,
        );
      }

      if (redirectChainSeen.has(nextUrl)) {
        throw new FetchPageError(
          `Redirect loop detected while fetching ${requestedUrl}: ${nextUrl}`,
          false,
        );
      }

      redirectChainSeen.add(nextUrl);
      redirectChain.push(nextUrl);
      currentUrl = nextUrl;
    }

    throw new FetchPageError(`Too many redirects fetching ${requestedUrl}`, false);
  } catch (error) {
    if (isAbortError(error)) {
      throw new FetchPageError(
        `Timed out fetching ${currentUrl} after ${timeoutMs}ms`,
        true,
      );
    }

    if (error instanceof FetchPageError) {
      throw error;
    }

    throw new FetchPageError(getErrorMessage(error), true);
  } finally {
    clearTimeout(timeout);
  }
}

class FetchPageError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

function isRetryableError(error: unknown): boolean {
  return error instanceof FetchPageError && error.retryable;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(error: unknown, backoffDelayMs: number): number {
  if (error instanceof FetchPageError && error.retryAfterMs !== undefined) {
    return Math.max(backoffDelayMs, error.retryAfterMs);
  }

  return backoffDelayMs;
}

function getRateLimitCooldownMs(headers: Headers): number {
  return parseRetryAfterMs(headers.get("retry-after")) ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS;
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) {
    return null;
  }

  const trimmedRetryAfter = retryAfter.trim();
  const delaySeconds = Number(trimmedRetryAfter);

  if (Number.isFinite(delaySeconds) && delaySeconds >= 0) {
    return delaySeconds * 1_000;
  }

  const retryAfterDateMs = Date.parse(trimmedRetryAfter);

  if (Number.isNaN(retryAfterDateMs)) {
    return null;
  }

  return Math.max(0, retryAfterDateMs - Date.now());
}

function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }

  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();

  return mediaType === "text/html" || mediaType === "application/xhtml+xml";
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
