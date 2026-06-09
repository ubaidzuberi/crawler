import { crawl } from "../src/crawler";
import type { FetchedPage, FetchPageOptions } from "../src/fetchPage";

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

  it("prints external links without enqueueing them", async () => {
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
    expect(fetcher).not.toHaveBeenCalledWith("https://monzo.com/");
    expect(fetcher).not.toHaveBeenCalledWith("https://community.monzo.com/");
    expect(result.pages).toEqual([
      {
        url: "https://crawlme.monzo.com/",
        links: [
          "https://monzo.com/",
          "https://community.monzo.com/",
          "https://crawlme.monzo.com/inside",
        ],
      },
      {
        url: "https://crawlme.monzo.com/inside",
        links: [],
      },
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
            ? `
              <a href="/broken">Broken</a>
              <a href="https://monzo.com/">External</a>
            `
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
      links: ["https://crawlme.monzo.com/broken", "https://monzo.com/"],
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
      linksIgnored: 0,
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

  it("fetches multiple queued pages concurrently", async () => {
    const deferredA = createDeferred<FetchedPage>();
    const deferredB = createDeferred<FetchedPage>();
    const deferredC = createDeferred<FetchedPage>();
    const fetcher = jest.fn((url: string): Promise<FetchedPage> => {
      if (url === "https://crawlme.monzo.com/") {
        return Promise.resolve({
          requestedUrl: url,
          finalUrl: url,
          html: `
            <a href="/a">A</a>
            <a href="/b">B</a>
            <a href="/c">C</a>
          `,
        });
      }

      if (url === "https://crawlme.monzo.com/a") {
        return deferredA.promise;
      }

      if (url === "https://crawlme.monzo.com/b") {
        return deferredB.promise;
      }

      if (url === "https://crawlme.monzo.com/c") {
        return deferredC.promise;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const crawlPromise = crawl("https://crawlme.monzo.com/", { fetcher });

    await waitUntil(() => fetcher.mock.calls.length >= 4);

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://crawlme.monzo.com/",
      "https://crawlme.monzo.com/a",
      "https://crawlme.monzo.com/b",
      "https://crawlme.monzo.com/c",
    ]);

    deferredA.resolve({
      requestedUrl: "https://crawlme.monzo.com/a",
      finalUrl: "https://crawlme.monzo.com/a",
      html: "",
    });
    deferredB.resolve({
      requestedUrl: "https://crawlme.monzo.com/b",
      finalUrl: "https://crawlme.monzo.com/b",
      html: "",
    });
    deferredC.resolve({
      requestedUrl: "https://crawlme.monzo.com/c",
      finalUrl: "https://crawlme.monzo.com/c",
      html: "",
    });

    await crawlPromise;
  });

  it("fetches a URL once when different workers discover it", async () => {
    const deferredA = createDeferred<FetchedPage>();
    const deferredB = createDeferred<FetchedPage>();
    const fetcher = jest.fn((url: string): Promise<FetchedPage> => {
      if (url === "https://crawlme.monzo.com/") {
        return Promise.resolve({
          requestedUrl: url,
          finalUrl: url,
          html: `
            <a href="/a">A</a>
            <a href="/b">B</a>
          `,
        });
      }

      if (url === "https://crawlme.monzo.com/a") {
        return deferredA.promise;
      }

      if (url === "https://crawlme.monzo.com/b") {
        return deferredB.promise;
      }

      if (url === "https://crawlme.monzo.com/shared") {
        return Promise.resolve({
          requestedUrl: url,
          finalUrl: url,
          html: "",
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const crawlPromise = crawl("https://crawlme.monzo.com/", { fetcher });

    await waitUntil(() => fetcher.mock.calls.length >= 3);

    deferredA.resolve({
      requestedUrl: "https://crawlme.monzo.com/a",
      finalUrl: "https://crawlme.monzo.com/a",
      html: `<a href="/shared">Shared</a>`,
    });
    deferredB.resolve({
      requestedUrl: "https://crawlme.monzo.com/b",
      finalUrl: "https://crawlme.monzo.com/b",
      html: `<a href="/shared">Shared</a>`,
    });

    await crawlPromise;

    expect(
      fetcher.mock.calls.filter(
        ([url]) => url === "https://crawlme.monzo.com/shared",
      ),
    ).toHaveLength(1);
  });

  it("emits a redirected final URL once when different workers reach it", async () => {
    const deferredA = createDeferred<FetchedPage>();
    const deferredB = createDeferred<FetchedPage>();
    const fetcher = jest.fn((url: string): Promise<FetchedPage> => {
      if (url === "https://crawlme.monzo.com/") {
        return Promise.resolve({
          requestedUrl: url,
          finalUrl: url,
          html: `
            <a href="/old-a">Old A</a>
            <a href="/old-b">Old B</a>
          `,
        });
      }

      if (url === "https://crawlme.monzo.com/old-a") {
        return deferredA.promise;
      }

      if (url === "https://crawlme.monzo.com/old-b") {
        return deferredB.promise;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const crawlPromise = crawl("https://crawlme.monzo.com/", { fetcher });

    await waitUntil(() => fetcher.mock.calls.length >= 3);

    deferredA.resolve({
      requestedUrl: "https://crawlme.monzo.com/old-a",
      finalUrl: "https://crawlme.monzo.com/canonical",
      html: "",
    });
    deferredB.resolve({
      requestedUrl: "https://crawlme.monzo.com/old-b",
      finalUrl: "https://crawlme.monzo.com/canonical",
      html: "",
    });

    const result = await crawlPromise;

    expect(
      result.pages.filter(
        (page) => page.url === "https://crawlme.monzo.com/canonical",
      ),
    ).toHaveLength(1);
    expect(result.stats.redirectDuplicatesSkipped).toBe(1);
  });

  it("marks intermediate redirect URLs as seen so later discoveries are skipped", async () => {
    const deferredLater = createDeferred<FetchedPage>();
    const fetcher = jest.fn((url: string): Promise<FetchedPage> => {
      if (url === "https://crawlme.monzo.com/") {
        return Promise.resolve({
          requestedUrl: url,
          finalUrl: url,
          html: `
            <a href="/old">Old</a>
            <a href="/later">Later</a>
          `,
        });
      }

      if (url === "https://crawlme.monzo.com/old") {
        return Promise.resolve({
          requestedUrl: url,
          finalUrl: "https://crawlme.monzo.com/final",
          redirectChain: [
            "https://crawlme.monzo.com/old",
            "https://crawlme.monzo.com/middle",
            "https://crawlme.monzo.com/final",
          ],
          html: "",
        });
      }

      if (url === "https://crawlme.monzo.com/later") {
        return deferredLater.promise;
      }

      if (url === "https://crawlme.monzo.com/middle") {
        return Promise.resolve({
          requestedUrl: url,
          finalUrl: url,
          html: "",
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const crawlPromise = crawl("https://crawlme.monzo.com/", { fetcher });

    await waitUntil(() => fetcher.mock.calls.length >= 3);

    deferredLater.resolve({
      requestedUrl: "https://crawlme.monzo.com/later",
      finalUrl: "https://crawlme.monzo.com/later",
      html: `<a href="/middle">Middle</a>`,
    });

    await crawlPromise;

    expect(
      fetcher.mock.calls.filter(
        ([url]) => url === "https://crawlme.monzo.com/middle",
      ),
    ).toHaveLength(0);
  });

  it("pauses new fetches during a shared host cooldown after rate limiting", async () => {
    let afterCallTime = 0;
    let cooldownAppliedAt = 0;
    const fetcher = jest.fn(
      (url: string, fetchOptions?: FetchPageOptions): Promise<FetchedPage> => {
        if (url === "https://crawlme.monzo.com/") {
          return Promise.resolve({
            requestedUrl: url,
            finalUrl: url,
            html: `
              <a href="/slow">Slow</a>
            `,
          });
        }

        if (url === "https://crawlme.monzo.com/slow") {
          cooldownAppliedAt = Date.now();
          fetchOptions?.onRateLimited?.(200);
          return Promise.resolve({
            requestedUrl: url,
            finalUrl: url,
            html: `<a href="/after">After</a>`,
          });
        }

        if (url === "https://crawlme.monzo.com/after") {
          afterCallTime = Date.now();
          return Promise.resolve({
            requestedUrl: url,
            finalUrl: url,
            html: "",
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    );

    const crawlPromise = crawl("https://crawlme.monzo.com/", { fetcher });

    await waitUntil(() =>
      fetcher.mock.calls.some(
        ([url]) => url === "https://crawlme.monzo.com/after",
      ),
    );
    await crawlPromise;

    expect(afterCallTime - cooldownAppliedAt).toBeGreaterThanOrEqual(150);
  });

  it("rejects unexpected callback errors instead of recording them as crawl failures", async () => {
    const fetcher = createFetcher({
      "https://crawlme.monzo.com/": "",
    });

    await expect(
      crawl("https://crawlme.monzo.com/", {
        fetcher,
        onPage: () => {
          throw new Error("Callback failed");
        },
      }),
    ).rejects.toThrow("Callback failed");
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for condition");
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
