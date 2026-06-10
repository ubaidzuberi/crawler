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

  it("retries rate limits using Retry-After when present", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: new Headers({ "retry-after": "0" }),
      } as Partial<Response> as Response)
      .mockResolvedValueOnce(createHtmlResponse("<html></html>"));

    await expect(
      fetchPage("https://crawlme.monzo.com/rate-limited", {
        retryBaseDelayMs: 0,
      }),
    ).resolves.toMatchObject({
      requestedUrl: "https://crawlme.monzo.com/rate-limited",
      finalUrl: "https://crawlme.monzo.com/rate-limited",
      html: "<html></html>",
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
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
