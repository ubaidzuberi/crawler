import {
  isWithinCrawlBoundary,
  normalizeHttpUrl,
} from "../src/url-utils";

describe("normalizeHttpUrl", () => {
  const currentPageUrl = "https://crawlme.monzo.com/docs/page";

  it("normalizes HTTP URLs without applying the crawl boundary", () => {
    expect(normalizeHttpUrl("https://MONZO.COM:443/about#team", currentPageUrl)).toBe(
      "https://monzo.com/about",
    );
  });

  it("resolves relative and protocol-relative URLs", () => {
    expect(normalizeHttpUrl("./about", currentPageUrl)).toBe(
      "https://crawlme.monzo.com/docs/about",
    );
    expect(normalizeHttpUrl("../blog", currentPageUrl)).toBe(
      "https://crawlme.monzo.com/blog",
    );
    expect(normalizeHttpUrl("/contact", currentPageUrl)).toBe(
      "https://crawlme.monzo.com/contact",
    );
    expect(normalizeHttpUrl("//monzo.com/about", currentPageUrl)).toBe(
      "https://monzo.com/about",
    );
  });

  it("rejects non-HTTP protocols and malformed URLs", () => {
    for (const href of [
      "mailto:support@example.com",
      "tel:+441234567890",
      "javascript:void(0)",
      "ftp://crawlme.monzo.com/file",
      "https://",
    ]) {
      expect(normalizeHttpUrl(href, currentPageUrl)).toBeNull();
    }
  });
});

describe("isWithinCrawlBoundary", () => {
  const startUrl = "https://crawlme.monzo.com/";

  it("uses an exact same-host policy", () => {
    expect(isWithinCrawlBoundary("https://crawlme.monzo.com/about", startUrl)).toBe(
      true,
    );
    expect(isWithinCrawlBoundary("http://crawlme.monzo.com/about", startUrl)).toBe(
      true,
    );
    expect(isWithinCrawlBoundary("https://monzo.com/", startUrl)).toBe(false);
    expect(isWithinCrawlBoundary("https://community.monzo.com/", startUrl)).toBe(
      false,
    );
    expect(isWithinCrawlBoundary("https://www.crawlme.monzo.com/", startUrl)).toBe(
      false,
    );
  });
});
