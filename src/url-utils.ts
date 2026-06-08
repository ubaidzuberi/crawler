const CRAWLABLE_PROTOCOLS = new Set(["http:", "https:"]);

export function normalizeCrawlUrl(
  href: string,
  currentPageUrl: string,
  startUrl: string,
): string | null {
  try {
    const start = new URL(startUrl);
    const candidate = new URL(href, currentPageUrl);

    if (!CRAWLABLE_PROTOCOLS.has(candidate.protocol)) {     // is this faster than just an if statement with ors?
      return null;
    }

    if (candidate.hostname !== start.hostname) {
      return null;
    }

    candidate.hash = "";

    return candidate.toString();
  } catch {
    return null;
  }
}
