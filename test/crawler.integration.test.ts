import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { crawl } from "../src/crawler";

describe("crawl integration", () => {
  it("crawls a local site through real HTTP responses and redirects", async () => {
    const server = await startTestServer((request, response) => {
      if (request.url === "/") {
        sendHtml(
          response,
          `
            <a href="/about">About</a>
            <a href="/old-careers">Careers</a>
            <a href="https://external.example/">External</a>
          `,
        );
        return;
      }

      if (request.url === "/about") {
        sendHtml(response, `<a href="/">Home</a>`);
        return;
      }

      if (request.url === "/old-careers") {
        response.writeHead(302, { location: "/careers" });
        response.end();
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
        new Set(["/", "/about", "/old-careers", "/careers"]),
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
          `${server.baseUrl}/old-careers`,
          "https://external.example/",
        ],
      });
      expect(result.failures).toEqual([]);
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
