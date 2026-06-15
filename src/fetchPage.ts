import { setTimeout as delay } from "node:timers/promises";
import {
  getErrorMessage,
  getRetryDelayMs,
  isKnownFetchError,
  isRetryableError,
  nonRetryableError,
  retryableError,
  unsupportedContentTypeError,
} from "./errors";

export type FetchedPage = {
  requestedUrl: string;
  finalUrl: string;
  html: string;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 20;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;
const DEFAULT_RATE_LIMIT_RETRY_DELAY_MS = 5_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export type FetchPageOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  isAllowedRedirect?: (url: string) => boolean;
};

type RedirectState = {
  requestedUrl: string;
  currentUrl: string;
  visitedRedirects: Set<string>;
  redirectCount: number;
  maxRedirects: number;
};

type RedirectTarget =
  | { shouldRedirect: false }
  | { shouldRedirect: true; nextUrl: string };

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
  const signal = AbortSignal.timeout(timeoutMs);
  const requestedUrl = new URL(url).toString();
  const visitedRedirects = new Set([requestedUrl]);
  let currentUrl = requestedUrl;

  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal,
      });

      const redirectTarget = getRedirectTarget(
        response,
        {
          requestedUrl,
          currentUrl,
          visitedRedirects,
          redirectCount,
          maxRedirects,
        },
        options,
      );

      if (redirectTarget.shouldRedirect) {
        visitedRedirects.add(redirectTarget.nextUrl);
        currentUrl = redirectTarget.nextUrl;
        continue;
      }

      const httpError = createHttpError(response, currentUrl);

      if (httpError) {
        throw httpError;
      }

      const contentType = response.headers.get("content-type");

      if (!isHtmlContentType(contentType)) {
        throw unsupportedContentTypeError(
          `Unsupported content type for ${currentUrl}: ${contentType ?? "missing"}`,
        );
      }

      return {
        requestedUrl,
        finalUrl: currentUrl,
        html: await response.text(),
      };
    }

    throw nonRetryableError(`Too many redirects fetching ${requestedUrl}`);
  } catch (error) {
    if (isAbortError(error)) {
      throw retryableError(`Timed out fetching ${currentUrl} after ${timeoutMs}ms`);
    }

    if (isKnownFetchError(error)) {
      throw error;
    }

    throw retryableError(getErrorMessage(error));
  }
}

export function createHttpError(
  response: Pick<Response, "ok" | "status" | "statusText" | "headers">,
  url: string,
): Error | null {
  if (response.ok) {
    return null;
  }

  const retryAfterMs =
    response.status === 429
      ? parseRetryAfterMs(response.headers.get("retry-after")) ??
        DEFAULT_RATE_LIMIT_RETRY_DELAY_MS
      : undefined;

  const message = `Failed to fetch ${url}: ${response.status} ${response.statusText}`;

  if (RETRYABLE_HTTP_STATUSES.has(response.status)) {
    return retryableError(message, retryAfterMs);
  }

  return nonRetryableError(message);
}

export function getRedirectTarget(
  response: Pick<Response, "status" | "headers">,
  state: RedirectState,
  options: Pick<FetchPageOptions, "isAllowedRedirect"> = {},
): RedirectTarget {
  if (!REDIRECT_STATUSES.has(response.status)) {
    return { shouldRedirect: false };
  }

  if (state.redirectCount === state.maxRedirects) {
    throw nonRetryableError(`Too many redirects fetching ${state.requestedUrl}`);
  }

  const location = response.headers.get("location");

  if (!location || location.trim() === "") {
    throw nonRetryableError(
      `Redirect from ${state.currentUrl} is missing a Location header`,
    );
  }

  const nextUrl = new URL(location, state.currentUrl).toString();

  if (options.isAllowedRedirect && !options.isAllowedRedirect(nextUrl)) {
    throw nonRetryableError(
      `Redirect target is outside the crawl boundary: ${nextUrl}`,
    );
  }

  if (state.visitedRedirects.has(nextUrl)) {
    throw nonRetryableError(
      `Redirect loop detected while fetching ${state.requestedUrl}: ${nextUrl}`,
    );
  }

  return { shouldRedirect: true, nextUrl };
}

export function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) {
    return null;
  }

  const trimmedRetryAfter = retryAfter.trim();
  const delaySeconds = Number(trimmedRetryAfter);

  if (Number.isFinite(delaySeconds) && delaySeconds >= 0) {
    return delaySeconds * 1_000;
  }

  return null;
}

export function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }

  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();

  return mediaType === "text/html" || mediaType === "application/xhtml+xml";
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}
