# Iteration 1 Notes

## src/url-utils.ts

Purpose: decide whether a discovered link is crawlable, and return its normalized URL string.

Manual decisions:

- Crawl boundary is exact same hostname as the starting URL, so `crawlme.monzo.com` does not include `monzo.com` or `community.monzo.com`.
- Only `http` and `https` links are crawlable.
- URL fragments are removed because `#section` points within the same page.
- Query strings are kept because they may represent different pages.
- Paths that differ by trailing slash are not merged manually because servers may treat them differently.
- Invalid or disallowed URLs return `null`.

Handled by JavaScript's `URL` API:

- Resolves relative links against the current page URL.
- Lowercases hostnames.
- Removes default ports like `:443` for HTTPS and `:80` for HTTP.
- Produces the normalized URL string with `toString()`.

Trade-off:

- The crawler uses same-host rules rather than same-origin rules, so `http://crawlme.monzo.com` is allowed when the crawl started from `https://crawlme.monzo.com`.

## src/links.ts

Purpose: extract crawlable links from a page's HTML.

Manual decisions:

- Only `<a>` elements are considered link sources.
- Anchors without `href`, empty `href`, or whitespace-only `href` are ignored.
- URL normalization and crawl-boundary filtering are delegated to `src/url-utils.ts`.
- Links are deduplicated after normalization, so `/about` and `/about#team` become one result.
- Discovery order is preserved in the returned array.

Handled by libraries/platform APIs:

- `node-html-parser` parses the HTML and provides `querySelectorAll("a")` plus `getAttribute("href")`.
- JavaScript `Set` deduplicates links and preserves insertion order when converted back to an array with `[...set]`.

Trade-off:

- The extractor only looks at anchor `href` values. It does not crawl links from scripts, forms, images, canonical tags, or other metadata.

## src/fetchPage.ts

Purpose: isolate the HTTP boundary for fetching a page.

Manual decisions:

- The fetcher returns the originally requested URL, the final response URL, and the response body text.
- Non-2xx responses throw an error.
- Requests time out after 5 seconds.
- Timeout errors are converted into normal error messages so the crawler can record them like other fetch failures.
- The crawler, not the fetcher, will decide whether a failed page should stop the crawl or be recorded and skipped.
- Content-type checks, retries, and custom headers are deferred to later iterations.

Handled by Node's built-in `fetch`:

- Makes the HTTP request.
- Follows redirects by default.
- Exposes the final URL with `response.url`.
- Reads the body as text with `response.text()`.
- `AbortController` cancels requests that exceed the timeout.

Trade-off:

- Keeping this module thin makes it easy to test the crawler with an injected fake fetcher instead of real network calls.

## src/crawler.ts

Purpose: orchestrate a sequential crawl using the URL, fetch, and link-extraction modules.

Manual decisions:

- Traversal uses breadth-first search.
- The BFS queue is implemented with an array plus an index instead of `shift()`, avoiding repeated array reindexing.
- URLs are added to `seen` when enqueued, not when fetched, so the same URL cannot be queued many times.
- `crawled` tracks final URLs that have already been processed, which avoids duplicate output when different requested URLs redirect to the same final URL.
- Fetch failures are recorded in `failures` and the crawler continues with other queued URLs.
- Redirects are accepted only if the final URL is still inside the starting hostname.
- The crawler returns structured results; printing is left to the CLI.
- Optional callbacks allow callers like the CLI to stream pages and failures as they are discovered.

Handled by existing modules:

- `src/url-utils.ts` normalizes the start URL and final redirect URLs.
- `src/fetchPage.ts` performs the HTTP request and exposes the final URL.
- `src/links.ts` extracts, normalizes, filters, deduplicates, and orders discovered links.

JavaScript/platform behaviour used:

- `Set` provides O(1)-style membership checks for `seen` and `crawled`.
- Arrays preserve insertion order, so the index-backed queue gives deterministic sequential BFS ordering.

Trade-off:

- The crawler is sequential in this iteration. This keeps correctness easier to reason about before adding bounded concurrency.

## src/cli.ts

Purpose: provide the command-line entry point for running the crawler.

Manual decisions:

- The CLI accepts the starting URL as the first positional argument.
- Missing or invalid start URLs set `process.exitCode = 1`.
- Successful page results are printed to stdout.
- Crawl failures are printed to stderr so they are separated from the main crawl output.
- Output is streamed as pages are visited instead of waiting for the entire crawl to finish.
- A crawl summary is printed after traversal completes.
- Output is intentionally plain text because the assignment values crawler behaviour over sitemap formatting.

Handled by Node:

- `process.argv` provides command-line arguments.
- `console.log` writes to stdout and `console.error` writes to stderr.
- `process.exitCode` lets Node exit with a non-zero status without abruptly terminating the process.

Trade-off:

- The CLI does not expose flags yet. Concurrency limits, timeouts, and max-page limits can be added when those behaviours exist.

## tsconfig.json

Purpose: configure TypeScript for this Node CLI project.

Manual decisions:

- Uses `module` and `moduleResolution` set to `Node16` to avoid the deprecated old `node`/`node10` resolution mode in TypeScript 6.
- Keeps the project CommonJS through `package.json`'s `"type": "commonjs"`.
- Enables `isolatedModules` because `ts-jest` expects it when using TypeScript's hybrid Node module modes.

Handled by TypeScript/Node:

- `Node16` module settings model modern Node module resolution.
- Because the package is CommonJS, TypeScript emits CommonJS output for `.ts` files.
- Full type-checking is still done by `tsc --noEmit`; Jest is used for test execution.

## jest.config.js

Purpose: configure Jest for TypeScript tests.

Manual decisions:

- Ignores `dist` so running tests after `npm run build` does not also run compiled test files.

Handled by `ts-jest`:

- Transforms TypeScript test files so Jest can execute them.
