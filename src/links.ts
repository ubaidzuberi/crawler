import { parse } from "node-html-parser";
import { isWithinCrawlBoundary, normalizeHttpUrl } from "./url-utils";

export type ExtractedLinks = {
  links: string[];
  crawlableLinks: string[];
};

export function extractLinks(
  html: string,
  currentPageUrl: string,
  startUrl: string,
): ExtractedLinks {
  const root = parse(html);
  const links = new Set<string>();

  for (const anchor of root.querySelectorAll("a")) {
    const href = anchor.getAttribute("href");

    if (!href || href.trim() === "") {
      continue;
    }

    const normalizedUrl = normalizeHttpUrl(href, currentPageUrl);

    if (!normalizedUrl) {
      continue;
    }

    if (links.has(normalizedUrl)) {
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
  };
}
