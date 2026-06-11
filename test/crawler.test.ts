import { crawl } from "../src/crawler";
import type { FetchedPage } from "../src/fetchPage";

describe("crawl", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("crawls same-host links and includes external links without fetching them", async () => {
    const fetcher = createFetcher({
      "https://crawlme.monzo.com/": `
        <a href="/inside">Inside</a>
        <a href="https://monzo.com/">External</a>
      `,
      "https://crawlme.monzo.com/inside": "",
    });

    const result = await crawl("https://crawlme.monzo.com/", {
      fetcher,
      requestDelayMs: 0,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://crawlme.monzo.com/",
      expect.any(Object),
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://crawlme.monzo.com/inside",
      expect.any(Object),
    );
    expect(fetcher).not.toHaveBeenCalledWith(
      "https://monzo.com/",
      expect.any(Object),
    );
    expect(result.pages).toEqual([
      {
        url: "https://crawlme.monzo.com/",
        links: ["https://crawlme.monzo.com/inside", "https://monzo.com/"],
      },
      {
        url: "https://crawlme.monzo.com/inside",
        links: [],
      },
    ]);
  });

  it("deduplicates normalized URLs before fetching them", async () => {
    const fetcher = createFetcher({
      "https://crawlme.monzo.com/": `
        <a href="/about">About</a>
        <a href="/about#team">About team</a>
      `,
      "https://crawlme.monzo.com/about": "",
    });

    await crawl("https://crawlme.monzo.com/", {
      fetcher,
      requestDelayMs: 0,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
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

    const result = await crawl("https://crawlme.monzo.com/", {
      fetcher,
      requestDelayMs: 0,
    });

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
  });

  it("silently skips non-HTML pages", async () => {
    global.fetch = jest.fn((url: URL | RequestInfo): Promise<Response> => {
      const requestedUrl = url.toString();

      if (requestedUrl === "https://crawlme.monzo.com/") {
        return Promise.resolve(
          createHtmlResponse(`
            <a href="/file.pdf">PDF</a>
            <a href="/next">Next</a>
          `),
        );
      }

      if (requestedUrl === "https://crawlme.monzo.com/file.pdf") {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/pdf" }),
          text: jest.fn().mockResolvedValue("pdf bytes"),
        } as Partial<Response> as Response);
      }

      if (requestedUrl === "https://crawlme.monzo.com/next") {
        return Promise.resolve(createHtmlResponse(""));
      }

      throw new Error(`Unexpected URL: ${requestedUrl}`);
    });

    const result = await crawl("https://crawlme.monzo.com/", {
      requestDelayMs: 0,
    });

    expect(result.pages.map((page) => page.url)).toEqual([
      "https://crawlme.monzo.com/",
      "https://crawlme.monzo.com/next",
    ]);
    expect(result.failures).toEqual([]);
  });

  it("emits a redirected final URL once when multiple requested URLs resolve to it", async () => {
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

    const result = await crawl("https://crawlme.monzo.com/", {
      fetcher,
      requestDelayMs: 0,
    });

    expect(result.pages.map((page) => page.url)).toEqual([
      "https://crawlme.monzo.com/",
      "https://crawlme.monzo.com/canonical",
    ]);
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

    const crawlPromise = crawl("https://crawlme.monzo.com/", {
      fetcher,
      requestDelayMs: 0,
    });

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

  it("waits before request starts when request delay is configured", async () => {
    let firstCallTime = 0;
    let secondCallTime = 0;
    const fetcher = jest.fn((url: string): Promise<FetchedPage> => {
      if (url === "https://crawlme.monzo.com/") {
        firstCallTime = Date.now();
        return Promise.resolve({
          requestedUrl: url,
          finalUrl: url,
          html: `<a href="/next">Next</a>`,
        });
      }

      if (url === "https://crawlme.monzo.com/next") {
        secondCallTime = Date.now();
        return Promise.resolve({
          requestedUrl: url,
          finalUrl: url,
          html: "",
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    await crawl("https://crawlme.monzo.com/", {
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

function createHtmlResponse(html: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
    text: jest.fn().mockResolvedValue(html),
  } as Partial<Response> as Response;
}
