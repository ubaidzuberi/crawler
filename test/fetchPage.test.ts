import { fetchPage } from "../src/fetchPage";

describe("fetchPage", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns the requested URL, final URL, and response body", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      url: "https://crawlme.monzo.com/final",
      text: jest.fn().mockResolvedValue("<html></html>"),
    } as Partial<Response> as Response);

    await expect(fetchPage("https://crawlme.monzo.com/start")).resolves.toEqual({
      requestedUrl: "https://crawlme.monzo.com/start",
      finalUrl: "https://crawlme.monzo.com/final",
      html: "<html></html>",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://crawlme.monzo.com/start",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
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

  it("throws when the request times out", async () => {
    global.fetch = jest.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );

    await expect(fetchPage("https://crawlme.monzo.com/slow", 1)).rejects.toThrow(
      "Timed out fetching https://crawlme.monzo.com/slow after 1ms",
    );
  });
});
