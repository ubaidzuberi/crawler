import { normalizeCrawlUrl } from "../src/url-utils";

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

  it("does not merge paths that differ only by trailing slash", () => {
    expect(
      normalizeCrawlUrl(
        "/about/",
        "https://crawlme.monzo.com/",
        startUrl,
      ),
    ).toBe("https://crawlme.monzo.com/about/");
  });
});
