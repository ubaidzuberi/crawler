export type FetchedPage = {
  requestedUrl: string;
  finalUrl: string;
  html: string;
};

const DEFAULT_TIMEOUT_MS = 5_000;

export async function fetchPage(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<FetchedPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    return {
      requestedUrl: url,
      finalUrl: response.url,
      html: await response.text(),
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Timed out fetching ${url} after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
