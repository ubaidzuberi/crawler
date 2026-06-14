import {
  createHttpError,
  fetchPage,
  getRedirectTarget,
  isAbortError,
  isHtmlContentType,
  parseRetryAfterMs,
} from "../src/fetchPage";
import { getRetryDelayMs } from "../src/errors";

describe("fetchPage policy", () => {
  it("accepts supported HTML content types", () => {
    expect(isHtmlContentType("text/html")).toBe(true);
    expect(isHtmlContentType("text/html; charset=utf-8")).toBe(true);
    expect(isHtmlContentType("APPLICATION/XHTML+XML")).toBe(true);
  });

  it("rejects unsupported or missing content types", () => {
    expect(isHtmlContentType("application/pdf")).toBe(false);
    expect(isHtmlContentType("application/json")).toBe(false);
    expect(isHtmlContentType(null)).toBe(false);
  });

  it("classifies retryable and permanent HTTP failures", () => {
    const retryableError = createHttpError(
      createResponse({ ok: false, status: 503, statusText: "Service Unavailable" }),
      "https://testsite.example/flaky",
    );
    const permanentError = createHttpError(
      createResponse({ ok: false, status: 404, statusText: "Not Found" }),
      "https://testsite.example/missing",
    );

    expect(retryableError).toEqual(
      expect.objectContaining({
        message:
          "Failed to fetch https://testsite.example/flaky: 503 Service Unavailable",
        retryable: true,
      }),
    );
    expect(permanentError).toEqual(
      expect.objectContaining({
        message: "Failed to fetch https://testsite.example/missing: 404 Not Found",
        retryable: false,
      }),
    );
  });

  it("uses Retry-After for rate limits and falls back when invalid", () => {
    const retryAfterError = createHttpError(
      createResponse({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: new Headers({ "retry-after": "2" }),
      }),
      "https://testsite.example/rate-limited",
    );
    const fallbackError = createHttpError(
      createResponse({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: new Headers({ "retry-after": "not a number" }),
      }),
      "https://testsite.example/rate-limited",
    );

    expect(getRetryDelayMs(retryAfterError, 0)).toBe(2000);
    expect(getRetryDelayMs(fallbackError, 0)).toBe(5000);
    expect(parseRetryAfterMs("0")).toBe(0);
    expect(parseRetryAfterMs(" -1 ")).toBeNull();
    expect(parseRetryAfterMs("")).toBeNull();
  });

  it("resolves valid redirect locations", () => {
    expect(
      getRedirectTarget(
        createResponse({
          status: 302,
          headers: new Headers({ location: "/next" }),
        }),
        createRedirectState(),
      ),
    ).toEqual({
      shouldRedirect: true,
      nextUrl: "https://testsite.example/next",
    });
  });

  it("rejects invalid redirect cases", () => {
    expect(() =>
      getRedirectTarget(
        createResponse({ status: 302, headers: new Headers() }),
        createRedirectState(),
      ),
    ).toThrow(
      "Redirect from https://testsite.example/start is missing a Location header",
    );

    expect(() =>
      getRedirectTarget(
        createResponse({
          status: 302,
          headers: new Headers({ location: "https://testsite.example/start" }),
        }),
        createRedirectState(),
      ),
    ).toThrow(
      "Redirect loop detected while fetching https://testsite.example/start: https://testsite.example/start",
    );

    expect(() =>
      getRedirectTarget(
        createResponse({
          status: 302,
          headers: new Headers({ location: "https://example.com/" }),
        }),
        createRedirectState(),
        { isAllowedRedirect: (url) => new URL(url).hostname === "testsite.example" },
      ),
    ).toThrow("Redirect target is outside the crawl boundary: https://example.com/");

    expect(() =>
      getRedirectTarget(
        createResponse({
          status: 302,
          headers: new Headers({ location: "/too-far" }),
        }),
        createRedirectState({ redirectCount: 2, maxRedirects: 2 }),
      ),
    ).toThrow("Too many redirects fetching https://testsite.example/start");
  });

  it("detects abort-style timeout errors", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isAbortError(new DOMException("timed out", "TimeoutError"))).toBe(true);
    expect(isAbortError(new Error("socket hang up"))).toBe(false);
  });
});

describe("fetchPage", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns the requested URL, final URL, response body, and redirect chain", async () => {
    global.fetch = jest.fn().mockResolvedValue(createHtmlResponse("<html></html>"));

    await expect(fetchPage("https://testsite.example/start")).resolves.toEqual({
      requestedUrl: "https://testsite.example/start",
      finalUrl: "https://testsite.example/start",
      html: "<html></html>",
      redirectChain: ["https://testsite.example/start"],
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://testsite.example/start",
      expect.objectContaining({
        redirect: "manual",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("follows redirect chains manually", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        createResponse({
          status: 301,
          headers: new Headers({ location: "/middle" }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          status: 302,
          headers: new Headers({ location: "/final" }),
        }),
      )
      .mockResolvedValueOnce(createHtmlResponse("<html></html>"));

    await expect(fetchPage("https://testsite.example/start")).resolves.toEqual({
      requestedUrl: "https://testsite.example/start",
      finalUrl: "https://testsite.example/final",
      html: "<html></html>",
      redirectChain: [
        "https://testsite.example/start",
        "https://testsite.example/middle",
        "https://testsite.example/final",
      ],
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://testsite.example/middle",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "https://testsite.example/final",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("retries after a retryable HTTP response", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        createResponse({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
        }),
      )
      .mockResolvedValueOnce(createHtmlResponse("<html></html>"));

    await expect(
      fetchPage("https://testsite.example/flaky", {
        retryBaseDelayMs: 0,
      }),
    ).resolves.toEqual({
      requestedUrl: "https://testsite.example/flaky",
      finalUrl: "https://testsite.example/flaky",
      html: "<html></html>",
      redirectChain: ["https://testsite.example/flaky"],
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("retries network errors from fetch", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(createHtmlResponse("<html></html>"));

    await expect(
      fetchPage("https://testsite.example/flaky-network", {
        retryBaseDelayMs: 0,
      }),
    ).resolves.toMatchObject({
      requestedUrl: "https://testsite.example/flaky-network",
      finalUrl: "https://testsite.example/flaky-network",
      html: "<html></html>",
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("stops before fetching a rejected redirect target", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(
      createResponse({
        status: 302,
        headers: new Headers({ location: "https://example.com/" }),
      }),
    );

    await expect(
      fetchPage("https://testsite.example/start", {
        isAllowedRedirect: (url) => new URL(url).hostname === "testsite.example",
      }),
    ).rejects.toThrow(
      "Redirect target is outside the crawl boundary: https://example.com/",
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

function createResponse(overrides: Partial<Response>): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(),
    text: jest.fn().mockResolvedValue(""),
    ...overrides,
  } as Partial<Response> as Response;
}

function createHtmlResponse(
  html: string,
  contentType = "text/html; charset=utf-8",
): Response {
  return createResponse({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": contentType }),
    text: jest.fn().mockResolvedValue(html),
  });
}

function createRedirectState(
  overrides: Partial<Parameters<typeof getRedirectTarget>[1]> = {},
): Parameters<typeof getRedirectTarget>[1] {
  return {
    requestedUrl: "https://testsite.example/start",
    currentUrl: "https://testsite.example/start",
    redirectChain: ["https://testsite.example/start"],
    redirectCount: 0,
    maxRedirects: 20,
    ...overrides,
  };
}
