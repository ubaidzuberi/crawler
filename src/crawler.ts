import { fetchPage, type FetchedPage, type FetchPageOptions } from "./fetchPage";
import { extractLinksWithStats } from "./links";
import { isWithinCrawlBoundary, normalizeCrawlUrl } from "./url-utils";

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
  stats: CrawlStats;
};

export type CrawlStats = {
  startUrl: string;
  pagesVisited: number;
  linksDiscovered: number;
  internalLinksQueued: number;
  linksIgnored: number;
  failedFetches: number;
  duplicateUrlsSkipped: number;
  redirectsFollowed: number;
  redirectDuplicatesSkipped: number;
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
  const normalizedStartUrl = normalizeCrawlUrl(startUrl, startUrl, startUrl);

  if (!normalizedStartUrl) {
    throw new Error(`Invalid start URL: ${startUrl}`);
  }

  const crawlStartUrl = normalizedStartUrl;
  const fetcher = options.fetcher ?? fetchPage;
  const requestDelayMs = options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS;
  const pages: CrawledPage[] = [];
  const failures: CrawlFailure[] = [];
  const stats: CrawlStats = {
    startUrl: crawlStartUrl,
    pagesVisited: 0,
    linksDiscovered: 0,
    internalLinksQueued: 0,
    linksIgnored: 0,
    failedFetches: 0,
    duplicateUrlsSkipped: 0,
    redirectsFollowed: 0,
    redirectDuplicatesSkipped: 0,
  };
  const queue = [crawlStartUrl];
  const seen = new Set(queue);
  const crawled = new Set<string>();
  let inFlight = 0;
  let queueIndex = 0;
  let waiters: Array<() => void> = [];    // what is this??

  // there's a bunch of functions defined within crawl because they need access to the crawl state.
  function hasQueuedUrl(): boolean {
    return queueIndex < queue.length;
  }

  function takeNextUrl(): string | null {
    if (!hasQueuedUrl()) {
      return null;
    }

    const requestedUrl = queue[queueIndex];
    queueIndex += 1;
    inFlight += 1;

    return requestedUrl;
  }

  function enqueueIfNew(url: string): boolean {
    if (seen.has(url)) {
      return false;
    }

    seen.add(url);
    queue.push(url);
    notifyStateChanged();

    return true;
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
    stats.failedFetches += 1;
    options.onFailure?.(failure);
  }

  async function processUrl(requestedUrl: string): Promise<void> {  // fetch urls till enqueing
    let fetchedPage: FetchedPage;

    try {
      fetchedPage = await fetcher(requestedUrl, {
        isAllowedRedirect: (redirectUrl) =>
          isWithinCrawlBoundary(redirectUrl, crawlStartUrl),
      });
    } catch (error) {
      recordFailure({
        url: requestedUrl,
        error: getErrorMessage(error),
      });
      return;
    }

    for (const redirectUrl of fetchedPage.redirectChain ?? [
      requestedUrl,
      fetchedPage.finalUrl,
    ]) {
      if (isWithinCrawlBoundary(redirectUrl, crawlStartUrl)) {
        seen.add(redirectUrl);
      }
    }

    const finalUrl = normalizeCrawlUrl(
      fetchedPage.finalUrl,
      fetchedPage.finalUrl,
      crawlStartUrl,
    );

    if (!finalUrl) {
      recordFailure({
        url: requestedUrl,
        error: `Final URL is outside the crawl boundary: ${fetchedPage.finalUrl}`,
      });
      return;
    }

    stats.redirectsFollowed += countRedirects(
      fetchedPage.redirectChain,
      requestedUrl,
      finalUrl,
    );

    if (crawled.has(finalUrl)) {
      stats.redirectDuplicatesSkipped += 1;
      return;
    }

    crawled.add(finalUrl);

    const extractedLinks = extractLinksWithStats(
      fetchedPage.html,
      finalUrl,
      crawlStartUrl,
    );
    const links = extractedLinks.links;
    const crawlableLinks = extractedLinks.crawlableLinks;

    stats.linksDiscovered += extractedLinks.linksDiscovered;
    stats.linksIgnored += extractedLinks.linksIgnored;
    stats.duplicateUrlsSkipped += extractedLinks.duplicateLinks;

    const crawledPage = { url: finalUrl, links };

    pages.push(crawledPage);
    stats.pagesVisited += 1;
    options.onPage?.(crawledPage);

    for (const link of crawlableLinks) {
      if (enqueueIfNew(link)) {
        stats.internalLinksQueued += 1;
      } else {
        stats.duplicateUrlsSkipped += 1;
      }
    }
  }

  async function runWorker(): Promise<void> { // repeatedly claim urls and process them
    while (true) {
      if (!hasQueuedUrl()) {
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

  return { pages, failures, stats };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function countRedirects(
  redirectChain: string[] | undefined,
  requestedUrl: string,
  finalUrl: string,
): number {
  if (redirectChain) {
    return Math.max(0, redirectChain.length - 1);
  }

  return requestedUrl === finalUrl ? 0 : 1;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
