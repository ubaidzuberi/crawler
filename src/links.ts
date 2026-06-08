import { parse } from "node-html-parser";
import { normalizeCrawlUrl } from "./url-utils";

export type ExtractedLinks = {
  links: string[];
  linksDiscovered: number;
  linksIgnored: number;
  duplicateLinks: number;
};

export function extractLinks(
  html: string,
  currentPageUrl: string,
  startUrl: string,
): string[] {
  return extractLinksWithStats(html, currentPageUrl, startUrl).links;
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

    const normalizedUrl = normalizeCrawlUrl(href, currentPageUrl, startUrl);

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

  return {
    links: [...links],
    linksDiscovered,
    linksIgnored,
    duplicateLinks,
  };
}
