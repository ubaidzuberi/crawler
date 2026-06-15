import {
  isWithinCrawlBoundary,
  normalizeHttpUrl,
} from "../src/url-utils";

describe("normalizeHttpUrl", () => {
  const currentPageUrl = "https://testsite.example/docs/page";

  it("normalizes HTTP URLs without applying the crawl boundary", () => {
    expect(normalizeHttpUrl("https://EXAMPLE.COM:443/about#team", currentPageUrl)).toBe(
      "https://example.com/about",
    );
  });

  it("resolves relative and protocol-relative URLs", () => {
    expect(normalizeHttpUrl("./about", currentPageUrl)).toBe(
      "https://testsite.example/docs/about",
    );
    expect(normalizeHttpUrl("../blog", currentPageUrl)).toBe(
      "https://testsite.example/blog",
    );
    expect(normalizeHttpUrl("/contact", currentPageUrl)).toBe(
      "https://testsite.example/contact",
    );
    expect(normalizeHttpUrl("//example.com/about", currentPageUrl)).toBe(
      "https://example.com/about",
    );
  });

  it("rejects non-HTTP protocols and malformed URLs", () => {
    for (const href of [
      "mailto:support@example.com",
      "tel:+441234567890",
      "javascript:void(0)",
      "ftp://testsite.example/file",
      "https://",
    ]) {
      expect(normalizeHttpUrl(href, currentPageUrl)).toBeNull();
    }
  });
});

describe("isWithinCrawlBoundary", () => {
  const startUrl = new URL("https://testsite.example/");

  it("uses an exact same-host policy", () => {
    expect(isWithinCrawlBoundary("https://testsite.example/about", startUrl)).toBe(
      true,
    );
    expect(isWithinCrawlBoundary("http://testsite.example/about", startUrl)).toBe(
      true,
    );
    expect(isWithinCrawlBoundary("https://example.com/", startUrl)).toBe(false);
    expect(isWithinCrawlBoundary("https://community.example/", startUrl)).toBe(
      false,
    );
    expect(isWithinCrawlBoundary("https://www.testsite.example/", startUrl)).toBe(
      false,
    );
  });
});
