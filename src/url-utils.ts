const CRAWLABLE_PROTOCOLS = new Set(["http:", "https:"]);

export function normalizeCrawlUrl( // checks if the URL is valid and is within the same hostname as the start URL
  href: string,
  currentPageUrl: string,
  startUrl: string,
): string | null {
  const normalizedUrl = normalizeHttpUrl(href, currentPageUrl);

  if (!normalizedUrl || !isWithinCrawlBoundary(normalizedUrl, startUrl)) {
    return null;
  }

  return normalizedUrl;
}

export function normalizeHttpUrl(   // normalises the URL and checks if it's valid
  href: string,
  currentPageUrl: string,
): string | null {
  try {
    const candidate = new URL(href, currentPageUrl);

    if (!CRAWLABLE_PROTOCOLS.has(candidate.protocol)) {
      return null;
    }

    candidate.hash = "";    // removes fragments, so #.. that is in the URL is removed

    return candidate.toString();    // returns the normlalised and cleaned URL as a string
  } catch {
    return null;
  }
}

export function isWithinCrawlBoundary(url: string, startUrl: string): boolean {   // checks if the URL is within the same hostname as the start URL
  const start = new URL(startUrl);
  const candidate = new URL(url);

  return candidate.hostname === start.hostname;
}
