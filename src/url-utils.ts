const CRAWLABLE_PROTOCOLS = new Set(["http:", "https:"]);

export function normalizeHttpUrl(
  href: string,
  currentPageUrl: string,
): string | null {
  try {
    const candidate = new URL(href, currentPageUrl);

    if (!CRAWLABLE_PROTOCOLS.has(candidate.protocol)) {
      return null;
    }

    candidate.hash = "";

    return candidate.toString();
  } catch {
    return null;
  }
}

export function normalizeCrawlUrl(
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

export function isWithinCrawlBoundary(url: string, startUrl: string): boolean {
  const start = new URL(startUrl);
  const candidate = new URL(url);

  return candidate.hostname === start.hostname;
}
