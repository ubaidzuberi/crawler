import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { crawl } from "../src/crawler";

describe("crawl integration", () => {
  it("crawls a local site through real HTTP responses", async () => {
    const server = await startTestServer((request, response) => {
      if (request.url === "/") {
        sendHtml(
          response,
          `
            <a href="/about">About</a>
            <a href="/careers">Careers</a>
            <a href="https://external.example/">External</a>
          `,
        );
        return;
      }

      if (request.url === "/about") {
        sendHtml(response, `<a href="/">Home</a>`);
        return;
      }

      if (request.url === "/careers") {
        sendHtml(response, "");
        return;
      }

      response.writeHead(404);
      response.end("Not found");
    });

    try {
      const result = await crawl(`${server.baseUrl}/`, { requestDelayMs: 0 });

      expect(new Set(server.requests)).toEqual(
        new Set(["/", "/about", "/careers"]),
      );
      expect(new Set(result.pages.map((page) => page.url))).toEqual(
        new Set([
          `${server.baseUrl}/`,
          `${server.baseUrl}/about`,
          `${server.baseUrl}/careers`,
        ]),
      );
      expect(result.pages.find((page) => page.url === `${server.baseUrl}/`)).toEqual({
        url: `${server.baseUrl}/`,
        links: [
          `${server.baseUrl}/about`,
          `${server.baseUrl}/careers`,
          "https://external.example/",
        ],
      });
      expect(result.failures).toEqual([]);
      expect(result.stats.pagesVisited).toBe(3);
      expect(result.stats.internalLinksQueued).toBe(2);
    } finally {
      await server.close();
    }
  });

  it("follows real HTTP redirects and records the final URL", async () => {
    const server = await startTestServer((request, response) => {
      if (request.url === "/") {
        sendHtml(response, `<a href="/old-about">Old About</a>`);
        return;
      }

      if (request.url === "/old-about") {
        response.writeHead(302, { location: "/about" });
        response.end();
        return;
      }

      if (request.url === "/about") {
        sendHtml(response, "");
        return;
      }

      response.writeHead(404);
      response.end("Not found");
    });

    try {
      const result = await crawl(`${server.baseUrl}/`, { requestDelayMs: 0 });

      expect(server.requests).toEqual(["/", "/old-about", "/about"]);
      expect(result.pages.map((page) => page.url)).toEqual([
        `${server.baseUrl}/`,
        `${server.baseUrl}/about`,
      ]);
      expect(result.failures).toEqual([]);
      expect(result.stats.redirectsFollowed).toBe(1);
    } finally {
      await server.close();
    }
  });
});

type TestServer = {
  baseUrl: string;
  requests: string[];
  close: () => Promise<void>;
};

function startTestServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<TestServer> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "/");
    handler(request, response);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address() as AddressInfo;

      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        requests,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          }),
      });
    });
  });
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}
