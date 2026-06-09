import { parse } from "node-html-parser";
import { isWithinCrawlBoundary, normalizeHttpUrl } from "./url-utils";

export type ExtractedLinks = {
  links: string[];
  crawlableLinks: string[];
  linksDiscovered: number;
  linksIgnored: number;
  duplicateLinks: number;
};

export function extractLinks(
  html: string,
  currentPageUrl: string,
  startUrl: string,
): string[] {
  return extractLinksWithStats(html, currentPageUrl, startUrl).crawlableLinks;
}

export function extractLinksWithStats(
  html: string,
  currentPageUrl: string,
  startUrl: string,
): ExtractedLinks {
  const root = parse(html);
  const links = new Set<string>();
  let linksDiscovered = 0;
  let linksIgnored = 0;
  let duplicateLinks = 0;

  for (const anchor of root.querySelectorAll("a")) {
    const href = anchor.getAttribute("href");

    if (!href || href.trim() === "") {
      continue;
    }

    linksDiscovered += 1;

    const normalizedUrl = normalizeHttpUrl(href, currentPageUrl);

    if (!normalizedUrl) {
      linksIgnored += 1;
      continue;
    }

    if (links.has(normalizedUrl)) {
      duplicateLinks += 1;
      continue;
    }

    links.add(normalizedUrl);
  }

  const normalizedLinks = [...links];

  return {
    links: normalizedLinks,
    crawlableLinks: normalizedLinks.filter((link) =>
      isWithinCrawlBoundary(link, startUrl),
    ),
    linksDiscovered,
    linksIgnored,
    duplicateLinks,
  };
}
