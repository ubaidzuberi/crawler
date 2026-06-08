import { fetchPage, type FetchedPage } from "./fetchPage";
import { extractLinksWithStats } from "./links";
import { normalizeCrawlUrl } from "./url-utils";

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
  fetcher?: (url: string) => Promise<FetchedPage>;
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

  const fetcher = options.fetcher ?? fetchPage;
  const pages: CrawledPage[] = [];
  const failures: CrawlFailure[] = [];
  const stats: CrawlStats = {
    startUrl: normalizedStartUrl,
    pagesVisited: 0,
    linksDiscovered: 0,
    internalLinksQueued: 0,
    linksIgnored: 0,
    failedFetches: 0,
    duplicateUrlsSkipped: 0,
    redirectsFollowed: 0,
    redirectDuplicatesSkipped: 0,
  };
  const queue = [normalizedStartUrl];
  const seen = new Set(queue);
  const crawled = new Set<string>();
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const requestedUrl = queue[queueIndex];
    queueIndex += 1;

    let fetchedPage: FetchedPage;

    try {
      fetchedPage = await fetcher(requestedUrl);
    } catch (error) {
      const failure = {
        url: requestedUrl,
        error: getErrorMessage(error),
      };

      failures.push(failure);
      stats.failedFetches += 1;
      options.onFailure?.(failure);
      continue;
    }

    const finalUrl = normalizeCrawlUrl(
      fetchedPage.finalUrl,
      fetchedPage.finalUrl,
      normalizedStartUrl,
    );

    if (!finalUrl) {
      const failure = {
        url: requestedUrl,
        error: `Final URL is outside the crawl boundary: ${fetchedPage.finalUrl}`,
      };

      failures.push(failure);
      stats.failedFetches += 1;
      options.onFailure?.(failure);
      continue;
    }

    if (requestedUrl !== finalUrl) {
      stats.redirectsFollowed += 1;
    }

    seen.add(finalUrl);

    if (crawled.has(finalUrl)) {
      stats.redirectDuplicatesSkipped += 1;
      continue;
    }

    const extractedLinks = extractLinksWithStats(
      fetchedPage.html,
      finalUrl,
      normalizedStartUrl,
    );
    const links = extractedLinks.links;

    stats.linksDiscovered += extractedLinks.linksDiscovered;
    stats.linksIgnored += extractedLinks.linksIgnored;
    stats.duplicateUrlsSkipped += extractedLinks.duplicateLinks;

    const crawledPage = { url: finalUrl, links };

    pages.push(crawledPage);
    stats.pagesVisited += 1;
    options.onPage?.(crawledPage);
    crawled.add(finalUrl);

    for (const link of links) {
      if (!seen.has(link)) {
        seen.add(link);
        queue.push(link);
        stats.internalLinksQueued += 1;
      } else {
        stats.duplicateUrlsSkipped += 1;
      }
    }
  }

  return { pages, failures, stats };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
