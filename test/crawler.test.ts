import { crawl } from "../src/crawler";
import { unsupportedContentTypeError } from "../src/errors";
import type { FetchedPage } from "../src/fetchPage";

describe("crawl", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("crawls same-host links and includes external links without fetching them", async () => {
    const fetcher = createFetcher({
      "https://testsite.example/": `
        <a href="/inside">Inside</a>
        <a href="https://example.com/">External</a>
      `,
      "https://testsite.example/inside": "",
    });

    const result = await crawl("https://testsite.example/", {
      fetcher,
      requestDelayMs: 0,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://testsite.example/",
      expect.any(Object),
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://testsite.example/inside",
      expect.any(Object),
    );
    expect(fetcher).not.toHaveBeenCalledWith(
      "https://example.com/",
      expect.any(Object),
    );
    expect(result.pages).toEqual([
      {
        url: "https://testsite.example/",
        links: ["https://testsite.example/inside", "https://example.com/"],
      },
      {
        url: "https://testsite.example/inside",
        links: [],
      },
    ]);
  });

  it("deduplicates normalized URLs before fetching them", async () => {
    const fetcher = createFetcher({
      "https://testsite.example/": `
        <a href="/about">About</a>
        <a href="/about#team">About team</a>
      `,
      "https://testsite.example/about": "",
    });

    await crawl("https://testsite.example/", {
      fetcher,
      requestDelayMs: 0,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("records fetch failures and continues crawling queued URLs", async () => {
    const onPage = jest.fn();
    const onFailure = jest.fn();
    const fetcher = jest.fn(async (url: string): Promise<FetchedPage> => {
      if (url === "https://testsite.example/broken") {
        throw new Error("Not Found");
      }

      const htmlByUrl: Record<string, string> = {
        "https://testsite.example/": `
          <a href="/broken">Broken</a>
          <a href="/working">Working</a>
        `,
        "https://testsite.example/working": "",
      };

      return {
        requestedUrl: url,
        finalUrl: url,
        html: htmlByUrl[url] ?? "",
      };
    });

    const result = await crawl("https://testsite.example/", {
      fetcher,
      onFailure,
      onPage,
      requestDelayMs: 0,
    });

    expect(result.pages.map((page) => page.url)).toEqual([
      "https://testsite.example/",
      "https://testsite.example/working",
    ]);
    expect(result.failures).toEqual([
      {
        url: "https://testsite.example/broken",
        error: "Not Found",
      },
    ]);
    expect(onPage).toHaveBeenCalledTimes(2);
    expect(onPage).toHaveBeenCalledWith({
      url: "https://testsite.example/",
      links: [
        "https://testsite.example/broken",
        "https://testsite.example/working",
      ],
    });
    expect(onPage).toHaveBeenCalledWith({
      url: "https://testsite.example/working",
      links: [],
    });
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith({
      url: "https://testsite.example/broken",
      error: "Not Found",
    });
  });

  it("silently skips non-HTML pages", async () => {
    const fetcher = jest.fn(async (url: string): Promise<FetchedPage> => {
      if (url === "https://testsite.example/file.pdf") {
        throw unsupportedContentTypeError(
          "Unsupported content type for https://testsite.example/file.pdf: application/pdf",
        );
      }

      const htmlByUrl: Record<string, string> = {
        "https://testsite.example/": `
          <a href="/file.pdf">PDF</a>
          <a href="/next">Next</a>
        `,
        "https://testsite.example/next": "",
      };

      return {
        requestedUrl: url,
        finalUrl: url,
        html: htmlByUrl[url] ?? "",
      };
    });

    const result = await crawl("https://testsite.example/", {
      fetcher,
      requestDelayMs: 0,
    });

    expect(result.pages.map((page) => page.url)).toEqual([
      "https://testsite.example/",
      "https://testsite.example/next",
    ]);
    expect(result.failures).toEqual([]);
  });

  it("emits a redirected final URL once when multiple requested URLs resolve to it", async () => {
    const fetcher = jest.fn(async (url: string): Promise<FetchedPage> => {
      if (url === "https://testsite.example/") {
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
        finalUrl: "https://testsite.example/canonical",
        html: "",
      };
    });

    const result = await crawl("https://testsite.example/", {
      fetcher,
      requestDelayMs: 0,
    });

    expect(result.pages.map((page) => page.url)).toEqual([
      "https://testsite.example/",
      "https://testsite.example/canonical",
    ]);
  });

  it("fetches queued pages concurrently without exceeding the configured limit", async () => {
    const childUrls = Array.from(
      { length: 10 },
      (_, index) => `https://testsite.example/page-${index}`,
    );
    const concurrency = 3;
    const pendingResolves: Array<() => void> = [];
    let activeFetches = 0;
    let maxActiveFetches = 0;
    let startedChildFetches = 0;

    const fetcher = jest.fn((url: string): Promise<FetchedPage> => {
      if (url === "https://testsite.example/") {
        return Promise.resolve({
          requestedUrl: url,
          finalUrl: url,
          html: childUrls
            .map((childUrl) => `<a href="${childUrl}">${childUrl}</a>`)
            .join(""),
        });
      }

      if (childUrls.includes(url)) {
        activeFetches += 1;
        startedChildFetches += 1;
        maxActiveFetches = Math.max(maxActiveFetches, activeFetches);

        return new Promise((resolve) => {
          pendingResolves.push(() => {
            activeFetches -= 1;
            resolve({
              requestedUrl: url,
              finalUrl: url,
              html: "",
            });
          });
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const crawlPromise = crawl("https://testsite.example/", {
      concurrency,
      fetcher,
      requestDelayMs: 0,
    });

    await waitUntil(() => pendingResolves.length === concurrency);

    while (startedChildFetches < childUrls.length) {
      const currentBatch = pendingResolves.splice(0);
      currentBatch.forEach((resolve) => resolve());
      await waitUntil(
        () => pendingResolves.length > 0 || startedChildFetches === childUrls.length,
      );
    }

    pendingResolves.splice(0).forEach((resolve) => resolve());

    await crawlPromise;

    expect(maxActiveFetches).toBeGreaterThan(1);
    expect(maxActiveFetches).toBeLessThanOrEqual(concurrency);
    expect(fetcher).toHaveBeenCalledTimes(11);
  });

  it("rejects invalid concurrency values", async () => {
    await expect(
      crawl("https://testsite.example/", {
        concurrency: 0,
        requestDelayMs: 0,
      }),
    ).rejects.toThrow("concurrency must be a positive integer");
  });

  it("waits before request starts when request delay is configured", async () => {
    let firstCallTime = 0;
    let secondCallTime = 0;
    const fetcher = jest.fn((url: string): Promise<FetchedPage> => {
      if (url === "https://testsite.example/") {
        firstCallTime = Date.now();
        return Promise.resolve({
          requestedUrl: url,
          finalUrl: url,
          html: `<a href="/next">Next</a>`,
        });
      }

      if (url === "https://testsite.example/next") {
        secondCallTime = Date.now();
        return Promise.resolve({
          requestedUrl: url,
          finalUrl: url,
          html: "",
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    await crawl("https://testsite.example/", {
      fetcher,
      requestDelayMs: 100,
    });

    expect(secondCallTime - firstCallTime).toBeGreaterThanOrEqual(75);
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

async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for condition");
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
