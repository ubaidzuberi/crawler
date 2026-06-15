import { setTimeout as delay } from "node:timers/promises";
import {
  fetchPage,
  type FetchedPage,
  type FetchPageOptions,
} from "./fetchPage";
import { getErrorMessage, isUnsupportedContentTypeError } from "./errors";
import { extractLinks } from "./links";
import { isWithinCrawlBoundary, normalizeHttpUrl } from "./url-utils";

const WORKER_COUNT = 5;
const DEFAULT_REQUEST_DELAY_MS = 500;

export type CrawledPage = {
  url: string;
  links: string[];
};

export type CrawlFailure = {
  url: string;
  error: string;
};

export type CrawlResult = {
  pages: CrawledPage[];
  failures: CrawlFailure[];
};

export type CrawlOptions = {
  fetcher?: (url: string, options?: FetchPageOptions) => Promise<FetchedPage>;
  requestDelayMs?: number;
  onPage?: (page: CrawledPage) => void;
  onFailure?: (failure: CrawlFailure) => void;
};

export async function crawl(
  startUrl: string,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const normalizedStartUrl = normalizeHttpUrl(startUrl, startUrl);

  if (!normalizedStartUrl) {
    throw new Error(`Invalid start URL: ${startUrl}`);
  }

  const crawlStartUrl = normalizedStartUrl;
  const fetcher = options.fetcher ?? fetchPage;
  const requestDelayMs = options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS;
  const pages: CrawledPage[] = [];
  const failures: CrawlFailure[] = [];
  const queue = [crawlStartUrl];
  const seen = new Set(queue);
  const crawled = new Set<string>();
  let inFlight = 0;
  let queueIndex = 0;
  let waiters: Array<() => void> = [];

  function takeNextUrl(): string | null {
    if (queueIndex >= queue.length) {
      return null;
    }

    const requestedUrl = queue[queueIndex];
    queueIndex += 1;
    inFlight += 1;

    return requestedUrl;
  }

  function enqueueIfNew(url: string): void {
    if (seen.has(url)) {
      return;
    }

    seen.add(url);
    queue.push(url);
    notifyStateChanged();
  }

  function waitForStateChange(): Promise<void> {
    return new Promise((resolve) => {
      waiters.push(resolve);
    });
  }

  function notifyStateChanged(): void {
    const currentWaiters = waiters;
    waiters = [];

    for (const resolve of currentWaiters) {
      resolve();
    }
  }

  function recordFailure(failure: CrawlFailure): void {
    failures.push(failure);
    options.onFailure?.(failure);
  }

  async function processUrl(requestedUrl: string): Promise<void> {
    let fetchedPage: FetchedPage;

    try {
      fetchedPage = await fetcher(requestedUrl, {
        isAllowedRedirect: (redirectUrl) =>
          isWithinCrawlBoundary(redirectUrl, crawlStartUrl),
      });
    } catch (error) {
      if (isUnsupportedContentTypeError(error)) {
        return;
      }

      recordFailure({
        url: requestedUrl,
        error: getErrorMessage(error),
      });
      return;
    }

    const finalUrl = normalizeHttpUrl(
      fetchedPage.finalUrl,
      fetchedPage.finalUrl,
    );

    if (!finalUrl || !isWithinCrawlBoundary(finalUrl, crawlStartUrl)) {
      recordFailure({
        url: requestedUrl,
        error: `Final URL is outside the crawl boundary: ${fetchedPage.finalUrl}`,
      });
      return;
    }

    if (crawled.has(finalUrl)) {
      return;
    }

    crawled.add(finalUrl);

    const { links, crawlableLinks } = extractLinks(
      fetchedPage.html,
      finalUrl,
      crawlStartUrl,
    );

    const crawledPage = { url: finalUrl, links };

    pages.push(crawledPage);
    options.onPage?.(crawledPage);

    for (const link of crawlableLinks) {
      enqueueIfNew(link);
    }
  }

  async function runWorker(): Promise<void> {
    while (true) {
      if (queueIndex >= queue.length) {
        if (inFlight === 0) {
          return;
        }

        await waitForStateChange();
        continue;
      }

      const requestedUrl = takeNextUrl();

      if (requestedUrl) {
        try {
          if (requestDelayMs > 0) {
            await delay(requestDelayMs);
          }

          await processUrl(requestedUrl);
        } finally {
          inFlight -= 1;
          notifyStateChanged();
        }

        continue;
      }
    }
  }

  await Promise.all(
    Array.from({ length: WORKER_COUNT }, async () => {
      await runWorker();
    }),
  );

  return { pages, failures };
}
