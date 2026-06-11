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
  redirectChain?: string[];
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 20;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;
const DEFAULT_RATE_LIMIT_RETRY_DELAY_MS = 5_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/*
This is the crawlers network layer, it:
1. takes a url
2. fetches the page with retries and timeouts for safety
3. follows redirects up to a limit, ensuring they are within the crawl boundary
4. reject non-HTML content types
5. return the final url (after redirects), the HTML, and the chain of redirects followed
*/

export type FetchPageOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  isAllowedRedirect?: (url: string) => boolean;
};

export async function fetchPage(    // this is the retry wrapper. it wraps fetchPageOnce
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

      await delay(getRetryDelayMs(error, retryBaseDelayMs * 2 ** attempt));   // worker waits for some time before retrying
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
  const redirectChain = [requestedUrl];     // for tracking the redirecdt chain for this request
  let currentUrl = requestedUrl;

  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal,
      });

      if (!REDIRECT_STATUSES.has(response.status)) {  // if not a redirect do the following
        if (!response.ok) {   // if not a 2xx response do the following
          const retryAfterMs =
            response.status === 429
              ? parseRetryAfterMs(response.headers.get("retry-after")) ??
                DEFAULT_RATE_LIMIT_RETRY_DELAY_MS
              : undefined;

          const message = `Failed to fetch ${currentUrl}: ${response.status} ${response.statusText}`;

          if (RETRYABLE_HTTP_STATUSES.has(response.status)) {
            throw retryableError(message, retryAfterMs);
          }

          throw nonRetryableError(message);
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
          redirectChain,
        };
      }

      if (redirectCount === maxRedirects) {   // stops if redirects exceed the limit
        throw nonRetryableError(`Too many redirects fetching ${requestedUrl}`);
      }


      // continue redirecting chain...
      const location = response.headers.get("location");

      if (!location || location.trim() === "") {
        throw nonRetryableError(
          `Redirect from ${currentUrl} is missing a Location header`,
        );
      }

      const nextUrl = new URL(location, currentUrl).toString();

      if (options.isAllowedRedirect && !options.isAllowedRedirect(nextUrl)) {
        throw nonRetryableError(
          `Redirect target is outside the crawl boundary: ${nextUrl}`,
        );
      }

      if (redirectChain.includes(nextUrl)) {
        throw nonRetryableError(
          `Redirect loop detected while fetching ${requestedUrl}: ${nextUrl}`,
        );
      }

      redirectChain.push(nextUrl);
      currentUrl = nextUrl;
    }

    throw nonRetryableError(`Too many redirects fetching ${requestedUrl}`);
  } catch (error) {
    if (isAbortError(error)) {
      throw retryableError(`Timed out fetching ${currentUrl} after ${timeoutMs}ms`);
    }

    if (isKnownFetchError(error)) {  // if the error thrown is a known/expected fetch error there's no need to modify it
      throw error;
    }

    throw retryableError(getErrorMessage(error)); // if its an unexpected error then we wrap it in the format
  }
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

  return null;
}

function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }

  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();

  return mediaType === "text/html" || mediaType === "application/xhtml+xml";
}

function isAbortError(error: unknown): boolean {  // this is for catching fetch timeout errors
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}  
