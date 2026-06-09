import { fetchPage } from "../src/fetchPage";

describe("fetchPage", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns the requested URL, final URL, and response body", async () => {
    global.fetch = jest.fn().mockResolvedValue(createHtmlResponse("<html></html>"));

    await expect(fetchPage("https://crawlme.monzo.com/start")).resolves.toEqual({
      requestedUrl: "https://crawlme.monzo.com/start",
      finalUrl: "https://crawlme.monzo.com/start",
      html: "<html></html>",
      redirectChain: ["https://crawlme.monzo.com/start"],
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://crawlme.monzo.com/start",
      expect.objectContaining({
        redirect: "manual",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("follows redirect chains manually", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 301,
        headers: new Headers({ location: "/middle" }),
      } as Partial<Response> as Response)
      .mockResolvedValueOnce({
        status: 302,
        headers: new Headers({ location: "/final" }),
      } as Partial<Response> as Response)
      .mockResolvedValueOnce(createHtmlResponse("<html></html>"));

    await expect(fetchPage("https://crawlme.monzo.com/start")).resolves.toEqual({
      requestedUrl: "https://crawlme.monzo.com/start",
      finalUrl: "https://crawlme.monzo.com/final",
      html: "<html></html>",
      redirectChain: [
        "https://crawlme.monzo.com/start",
        "https://crawlme.monzo.com/middle",
        "https://crawlme.monzo.com/final",
      ],
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://crawlme.monzo.com/middle",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "https://crawlme.monzo.com/final",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("rejects redirect targets outside the allowed boundary before fetching them", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      status: 302,
      headers: new Headers({ location: "https://monzo.com/" }),
    } as Partial<Response> as Response);

    await expect(
      fetchPage("https://crawlme.monzo.com/start", {
        isAllowedRedirect: (url) => new URL(url).hostname === "crawlme.monzo.com",
      }),
    ).rejects.toThrow(
      "Redirect target is outside the crawl boundary: https://monzo.com/",
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("throws when a redirect is missing a Location header", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 302,
      headers: new Headers(),
    } as Partial<Response> as Response);

    await expect(fetchPage("https://crawlme.monzo.com/start")).rejects.toThrow(
      "Redirect from https://crawlme.monzo.com/start is missing a Location header",
    );
  });

  it("throws when a redirect loop is detected", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 302,
        headers: new Headers({ location: "/middle" }),
      } as Partial<Response> as Response)
      .mockResolvedValueOnce({
        status: 302,
        headers: new Headers({ location: "/start" }),
      } as Partial<Response> as Response);

    await expect(fetchPage("https://crawlme.monzo.com/start")).rejects.toThrow(
      "Redirect loop detected while fetching https://crawlme.monzo.com/start: https://crawlme.monzo.com/start",
    );
  });

  it("throws when the redirect limit is exceeded", async () => {
    global.fetch = jest.fn((url: URL | RequestInfo) => {
      const currentUrl = url.toString();
      const nextUrl = currentUrl.endsWith("/start")
        ? "https://crawlme.monzo.com/one"
        : "https://crawlme.monzo.com/two";

      return Promise.resolve({
        status: 302,
        headers: new Headers({ location: nextUrl }),
      } as Partial<Response> as Response);
    });

    await expect(
      fetchPage("https://crawlme.monzo.com/start", { maxRedirects: 1 }),
    ).rejects.toThrow("Too many redirects fetching https://crawlme.monzo.com/start");
  });

  it("throws when the response is not successful", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Partial<Response> as Response);

    await expect(fetchPage("https://crawlme.monzo.com/missing")).rejects.toThrow(
      "Failed to fetch https://crawlme.monzo.com/missing: 404 Not Found",
    );
  });

  it("retries transient HTTP failures", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      } as Partial<Response> as Response)
      .mockResolvedValueOnce(createHtmlResponse("<html></html>"));

    await expect(
      fetchPage("https://crawlme.monzo.com/flaky", {
        retryBaseDelayMs: 0,
      }),
    ).resolves.toEqual({
      requestedUrl: "https://crawlme.monzo.com/flaky",
      finalUrl: "https://crawlme.monzo.com/flaky",
      html: "<html></html>",
      redirectChain: ["https://crawlme.monzo.com/flaky"],
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent HTTP failures", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Partial<Response> as Response);

    await expect(
      fetchPage("https://crawlme.monzo.com/missing", {
        retryBaseDelayMs: 0,
      }),
    ).rejects.toThrow(
      "Failed to fetch https://crawlme.monzo.com/missing: 404 Not Found",
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries network errors", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(createHtmlResponse("<html></html>"));

    await expect(
      fetchPage("https://crawlme.monzo.com/flaky-network", {
        retryBaseDelayMs: 0,
      }),
    ).resolves.toMatchObject({
      requestedUrl: "https://crawlme.monzo.com/flaky-network",
      finalUrl: "https://crawlme.monzo.com/flaky-network",
      html: "<html></html>",
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry redirect policy failures", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 302,
      headers: new Headers({ location: "https://monzo.com/" }),
    } as Partial<Response> as Response);

    await expect(
      fetchPage("https://crawlme.monzo.com/start", {
        isAllowedRedirect: (url) => new URL(url).hostname === "crawlme.monzo.com",
        retryBaseDelayMs: 0,
      }),
    ).rejects.toThrow(
      "Redirect target is outside the crawl boundary: https://monzo.com/",
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("reports Retry-After cooldowns for rate limits", async () => {
    const onRateLimited = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: new Headers({ "retry-after": "10" }),
    } as Partial<Response> as Response);

    await expect(
      fetchPage("https://crawlme.monzo.com/rate-limited", {
        maxRetries: 0,
        onRateLimited,
      }),
    ).rejects.toThrow(
      "Failed to fetch https://crawlme.monzo.com/rate-limited: 429 Too Many Requests",
    );

    expect(onRateLimited).toHaveBeenCalledWith(10_000);
  });

  it("uses a default cooldown when a rate limit has no Retry-After header", async () => {
    const onRateLimited = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: new Headers(),
    } as Partial<Response> as Response);

    await expect(
      fetchPage("https://crawlme.monzo.com/rate-limited", {
        maxRetries: 0,
        onRateLimited,
      }),
    ).rejects.toThrow(
      "Failed to fetch https://crawlme.monzo.com/rate-limited: 429 Too Many Requests",
    );

    expect(onRateLimited).toHaveBeenCalledWith(30_000);
  });

  it("throws when the request times out", async () => {
    global.fetch = jest.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );

    await expect(
      fetchPage("https://crawlme.monzo.com/slow", { timeoutMs: 1 }),
    ).rejects.toThrow("Timed out fetching https://crawlme.monzo.com/slow after 1ms");
  });

  it("accepts XHTML responses", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        createHtmlResponse("<html></html>", "application/xhtml+xml; charset=utf-8"),
      );

    await expect(fetchPage("https://crawlme.monzo.com/xhtml")).resolves.toMatchObject({
      finalUrl: "https://crawlme.monzo.com/xhtml",
      html: "<html></html>",
    });
  });

  it("rejects missing content type", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: jest.fn().mockResolvedValue("<html></html>"),
    } as Partial<Response> as Response);

    await expect(fetchPage("https://crawlme.monzo.com/no-header")).rejects.toThrow(
      "Unsupported content type for https://crawlme.monzo.com/no-header: missing",
    );
  });

  it("rejects non-HTML content types without retrying", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/pdf" }),
      text: jest.fn().mockResolvedValue("pdf bytes"),
    } as Partial<Response> as Response);

    await expect(
      fetchPage("https://crawlme.monzo.com/file.pdf", { retryBaseDelayMs: 0 }),
    ).rejects.toThrow(
      "Unsupported content type for https://crawlme.monzo.com/file.pdf: application/pdf",
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

function createHtmlResponse(
  html: string,
  contentType = "text/html; charset=utf-8",
): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": contentType }),
    text: jest.fn().mockResolvedValue(html),
  } as Partial<Response> as Response;
}
