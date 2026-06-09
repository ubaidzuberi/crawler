import {
  isWithinCrawlBoundary,
  normalizeCrawlUrl,
  normalizeHttpUrl,
} from "../src/url-utils";

describe("normalizeHttpUrl", () => {
  it("normalizes HTTP links without applying the crawl boundary", () => {
    expect(
      normalizeHttpUrl(
        "https://MONZO.COM/about#team",
        "https://crawlme.monzo.com/",
      ),
    ).toBe("https://monzo.com/about");
  });

  it("rejects non-HTTP protocols and invalid URLs", () => {
    expect(
      normalizeHttpUrl("mailto:support@example.com", "https://crawlme.monzo.com/"),
    ).toBeNull();

    expect(normalizeHttpUrl("https://", "https://crawlme.monzo.com/")).toBeNull();
  });
});

describe("normalizeCrawlUrl", () => {
  const startUrl = "https://crawlme.monzo.com/";

  it("resolves relative URLs against the current page URL", () => {
    expect(
      normalizeCrawlUrl(
        "../about",
        "https://crawlme.monzo.com/docs/page",
        startUrl,
      ),
    ).toBe("https://crawlme.monzo.com/about");
  });

  it("documents URL's trailing-slash behaviour for relative paths", () => {
    expect(
      normalizeCrawlUrl(
        "../about",
        "https://crawlme.monzo.com/docs/page/",
        startUrl,
      ),
    ).toBe("https://crawlme.monzo.com/docs/about");
  });

  it("removes fragments and keeps query strings", () => {
    expect(
      normalizeCrawlUrl(
        "/search?q=current-account#results",
        "https://crawlme.monzo.com/",
        startUrl,
      ),
    ).toBe("https://crawlme.monzo.com/search?q=current-account");
  });

  it("rejects URLs outside the starting hostname", () => {
    expect(
      normalizeCrawlUrl(
        "https://monzo.com/",
        "https://crawlme.monzo.com/",
        startUrl,
      ),
    ).toBeNull();

    expect(
      normalizeCrawlUrl(
        "https://community.monzo.com/",
        "https://crawlme.monzo.com/",
        startUrl,
      ),
    ).toBeNull();

    expect(
      normalizeCrawlUrl(
        "https://facebook.com/monzo",
        "https://crawlme.monzo.com/",
        startUrl,
      ),
    ).toBeNull();
  });

  it("allows HTTP and HTTPS on the same hostname", () => {
    expect(
      normalizeCrawlUrl(
        "http://crawlme.monzo.com/about",
        "https://crawlme.monzo.com/",
        startUrl,
      ),
    ).toBe("http://crawlme.monzo.com/about");
  });

  it("rejects non-HTTP protocols and invalid URLs", () => {
    expect(
      normalizeCrawlUrl(
        "mailto:support@example.com",
        "https://crawlme.monzo.com/",
        startUrl,
      ),
    ).toBeNull();

    expect(
      normalizeCrawlUrl(
        "https://",
        "https://crawlme.monzo.com/",
        startUrl,
      ),
    ).toBeNull();
  });

  it("relies on URL to normalize host case and default ports", () => {
    expect(
      normalizeCrawlUrl(
        "https://CRAWLME.MONZO.COM:443/About",
        "https://crawlme.monzo.com/",
        startUrl,
      ),
    ).toBe("https://crawlme.monzo.com/About");
  });

  it("relies on URL to add the root slash for bare host URLs", () => {
    expect(
      normalizeCrawlUrl(
        "https://crawlme.monzo.com",
        "https://crawlme.monzo.com/",
        startUrl,
      ),
    ).toBe("https://crawlme.monzo.com/");
  });

  it("relies on URL to normalize dot segments in paths", () => {
    expect(
      normalizeCrawlUrl(
        "/docs/../about",
        "https://crawlme.monzo.com/",
        startUrl,
      ),
    ).toBe("https://crawlme.monzo.com/about");
  });

  it("does not merge paths that differ only by trailing slash", () => {
    expect(
      normalizeCrawlUrl(
        "/about/",
        "https://crawlme.monzo.com/",
        startUrl,
      ),
    ).toBe("https://crawlme.monzo.com/about/");
  });

  it("does not merge root and index.html paths", () => {
    expect(
      normalizeCrawlUrl(
        "/index.html",
        "https://crawlme.monzo.com/",
        startUrl,
      ),
    ).toBe("https://crawlme.monzo.com/index.html");
  });

  it("does not sort or remove query parameters", () => {
    expect(
      normalizeCrawlUrl(
        "/search?b=2&a=1&utm_source=test&empty=",
        "https://crawlme.monzo.com/",
        startUrl,
      ),
    ).toBe("https://crawlme.monzo.com/search?b=2&a=1&utm_source=test&empty=");
  });
});

describe("isWithinCrawlBoundary", () => {
  const startUrl = "https://crawlme.monzo.com/";

  it("accepts URLs on the starting hostname", () => {
    expect(
      isWithinCrawlBoundary("https://crawlme.monzo.com/about", startUrl),
    ).toBe(true);
  });

  it("rejects parent domains and sibling subdomains", () => {
    expect(isWithinCrawlBoundary("https://monzo.com/", startUrl)).toBe(false);
    expect(isWithinCrawlBoundary("https://community.monzo.com/", startUrl)).toBe(
      false,
    );
  });
});
