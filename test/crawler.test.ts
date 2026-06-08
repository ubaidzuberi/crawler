import { crawl } from "../src/crawler";
import type { FetchedPage } from "../src/fetchPage";

describe("crawl", () => {
  it("crawls pages sequentially using breadth-first order", async () => {
    const fetcher = createFetcher({
      "https://crawlme.monzo.com/": `
        <a href="/first">First</a>
        <a href="/second">Second</a>
      `,
      "https://crawlme.monzo.com/first": `
        <a href="/third">Third</a>
      `,
      "https://crawlme.monzo.com/second": "",
      "https://crawlme.monzo.com/third": "",
    });

    const result = await crawl("https://crawlme.monzo.com/", { fetcher });

    expect(result.pages.map((page) => page.url)).toEqual([
      "https://crawlme.monzo.com/",
      "https://crawlme.monzo.com/first",
      "https://crawlme.monzo.com/second",
      "https://crawlme.monzo.com/third",
    ]);
    expect(result.failures).toEqual([]);
  });

  it("does not crawl the same normalized URL twice", async () => {
    const fetcher = createFetcher({
      "https://crawlme.monzo.com/": `
        <a href="/about">About</a>
        <a href="/about#team">Team</a>
      `,
      "https://crawlme.monzo.com/about": "",
    });

    const result = await crawl("https://crawlme.monzo.com/", { fetcher });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.pages.map((page) => page.url)).toEqual([
      "https://crawlme.monzo.com/",
      "https://crawlme.monzo.com/about",
    ]);
  });

  it("does not enqueue links outside the starting hostname", async () => {
    const fetcher = createFetcher({
      "https://crawlme.monzo.com/": `
        <a href="https://monzo.com/">Parent domain</a>
        <a href="https://community.monzo.com/">Other subdomain</a>
        <a href="/inside">Inside</a>
      `,
      "https://crawlme.monzo.com/inside": "",
    });

    const result = await crawl("https://crawlme.monzo.com/", { fetcher });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.pages.map((page) => page.url)).toEqual([
      "https://crawlme.monzo.com/",
      "https://crawlme.monzo.com/inside",
    ]);
  });

  it("records fetch failures and continues crawling queued URLs", async () => {
    const fetcher = jest.fn(async (url: string): Promise<FetchedPage> => {
      if (url === "https://crawlme.monzo.com/broken") {
        throw new Error("Not Found");
      }

      const htmlByUrl: Record<string, string> = {
        "https://crawlme.monzo.com/": `
          <a href="/broken">Broken</a>
          <a href="/working">Working</a>
        `,
        "https://crawlme.monzo.com/working": "",
      };

      return {
        requestedUrl: url,
        finalUrl: url,
        html: htmlByUrl[url] ?? "",
      };
    });

    const result = await crawl("https://crawlme.monzo.com/", { fetcher });

    expect(result.pages.map((page) => page.url)).toEqual([
      "https://crawlme.monzo.com/",
      "https://crawlme.monzo.com/working",
    ]);
    expect(result.failures).toEqual([
      {
        url: "https://crawlme.monzo.com/broken",
        error: "Not Found",
      },
    ]);
    expect(result.stats.failedFetches).toBe(1);
  });

  it("calls callbacks as pages and failures are discovered", async () => {
    const fetcher = jest.fn(async (url: string): Promise<FetchedPage> => {
      if (url === "https://crawlme.monzo.com/broken") {
        throw new Error("Not Found");
      }

      return {
        requestedUrl: url,
        finalUrl: url,
        html:
          url === "https://crawlme.monzo.com/"
            ? `<a href="/broken">Broken</a>`
            : "",
      };
    });
    const onPage = jest.fn();
    const onFailure = jest.fn();

    await crawl("https://crawlme.monzo.com/", {
      fetcher,
      onPage,
      onFailure,
    });

    expect(onPage).toHaveBeenCalledWith({
      url: "https://crawlme.monzo.com/",
      links: ["https://crawlme.monzo.com/broken"],
    });
    expect(onFailure).toHaveBeenCalledWith({
      url: "https://crawlme.monzo.com/broken",
      error: "Not Found",
    });
  });

  it("uses the final URL after redirects for crawling and link extraction", async () => {
    const fetcher = jest.fn(async (url: string): Promise<FetchedPage> => {
      if (url === "https://crawlme.monzo.com/old") {
        return {
          requestedUrl: url,
          finalUrl: "https://crawlme.monzo.com/docs/new",
          html: `<a href="child">Child</a>`,
        };
      }

      return {
        requestedUrl: url,
        finalUrl: url,
        html: "",
      };
    });

    const result = await crawl("https://crawlme.monzo.com/old", { fetcher });

    expect(result.pages).toEqual([
      {
        url: "https://crawlme.monzo.com/docs/new",
        links: ["https://crawlme.monzo.com/docs/child"],
      },
      {
        url: "https://crawlme.monzo.com/docs/child",
        links: [],
      },
    ]);
  });

  it("records a failure when a redirect leaves the crawl boundary", async () => {
    const fetcher = jest.fn(async (url: string): Promise<FetchedPage> => ({
      requestedUrl: url,
      finalUrl: "https://monzo.com/",
      html: "",
    }));

    const result = await crawl("https://crawlme.monzo.com/", { fetcher });

    expect(result.pages).toEqual([]);
    expect(result.failures).toEqual([
      {
        url: "https://crawlme.monzo.com/",
        error: "Final URL is outside the crawl boundary: https://monzo.com/",
      },
    ]);
    expect(result.stats.failedFetches).toBe(1);
  });

  it("returns crawl summary statistics", async () => {
    const fetcher = createFetcher({
      "https://crawlme.monzo.com/": `
        <a href="/about">About</a>
        <a href="/about#team">Duplicate</a>
        <a href="https://monzo.com/">External</a>
      `,
      "https://crawlme.monzo.com/about": `
        <a href="/">Already seen</a>
      `,
    });

    const result = await crawl("https://crawlme.monzo.com/", { fetcher });

    expect(result.stats).toEqual({
      startUrl: "https://crawlme.monzo.com/",
      pagesVisited: 2,
      linksDiscovered: 4,
      internalLinksQueued: 1,
      linksIgnored: 1,
      failedFetches: 0,
      duplicateUrlsSkipped: 2,
      redirectsFollowed: 0,
      redirectDuplicatesSkipped: 0,
    });
  });

  it("counts redirects and redirect duplicates", async () => {
    const fetcher = jest.fn(async (url: string): Promise<FetchedPage> => {
      if (url === "https://crawlme.monzo.com/") {
        return {
          requestedUrl: url,
          finalUrl: url,
          html: `
            <a href="/old-a">Old A</a>
            <a href="/old-b">Old B</a>
          `,
        };
      }

      return {
        requestedUrl: url,
        finalUrl: "https://crawlme.monzo.com/canonical",
        html: "",
      };
    });

    const result = await crawl("https://crawlme.monzo.com/", { fetcher });

    expect(result.pages.map((page) => page.url)).toEqual([
      "https://crawlme.monzo.com/",
      "https://crawlme.monzo.com/canonical",
    ]);
    expect(result.stats.redirectsFollowed).toBe(2);
    expect(result.stats.redirectDuplicatesSkipped).toBe(1);
    expect(result.stats.duplicateUrlsSkipped).toBe(0);
  });

  it("rejects invalid start URLs", async () => {
    await expect(crawl("not a url")).rejects.toThrow(
      "Invalid start URL: not a url",
    );
  });
});

function createFetcher(htmlByUrl: Record<string, string>) {
  return jest.fn(async (url: string): Promise<FetchedPage> => ({
    requestedUrl: url,
    finalUrl: url,
    html: htmlByUrl[url] ?? "",
  }));
}
