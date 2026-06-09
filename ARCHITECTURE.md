# Architecture

This project is a small same-host web crawler. It is intentionally not a crawler framework: the code favours explicit behaviour, focused modules, and testable boundaries.

## High-Level Flow

```text
CLI start URL
  -> crawl(startUrl)
  -> normalize and validate start URL
  -> seed frontier queue
  -> 5 workers drain queue
  -> fetch page with timeout/retries/manual redirects/content-type check
  -> extract links from HTML
  -> print all HTTP(S) links found on the page
  -> enqueue only same-host crawlable links
  -> finish when queue is empty and no workers are in flight
```

## Modules

- `src/cli.ts`: command-line entry point. Reads the start URL, streams visited pages and links, prints failures and a final summary.
- `src/crawler.ts`: crawl orchestration. Owns workers, queue/frontier state, `seen`, `crawled`, stats, callbacks, and shared host cooldown.
- `src/fetchPage.ts`: HTTP boundary. Owns fetch timeout, manual redirects, retry policy, `429` cooldown signals, and content-type filtering.
- `src/links.ts`: HTML parsing and link extraction. Returns all normalized HTTP(S) links plus the same-host subset used for crawling.
- `src/url-utils.ts`: URL normalization and same-host boundary checks.

## Crawl Boundary

The crawler stays on the exact same hostname as the starting URL.

Starting from:

```text
https://crawlme.monzo.com/
```

Allowed:

```text
https://crawlme.monzo.com/about
http://crawlme.monzo.com/about
```

Rejected:

```text
https://monzo.com/
https://community.monzo.com/
https://facebook.com/monzo
```

This is same-host, not same-origin, so HTTP and HTTPS on the same hostname are both crawlable.

## URL Normalization

The crawler uses JavaScript's `URL` API for syntax normalization:

- resolves relative URLs
- lowercases hostnames
- removes default ports
- normalizes dot segments
- serializes bare hosts with `/`
- removes fragments via `hash = ""`

Manual semantic canonicalisation is intentionally not added. These remain distinct:

- `/about` and `/about/`
- `/` and `/index.html`
- differently ordered query strings
- URLs with and without tracking parameters
- HTTP and HTTPS URLs

Reason: servers can route these differently. If a server canonicalizes one URL to another, redirect handling will observe that and deduplicate the final URL.

## Link Extraction

`links.ts` only reads `<a href="...">` values.

It returns:

- `links`: all normalized HTTP(S) links found on the page, including external links
- `crawlableLinks`: the same-host subset derived from `links`

The CLI prints `links`, matching the assignment wording: "links found on that page". The crawler only enqueues `crawlableLinks`.

Non-HTTP links such as `mailto:`, `tel:`, `javascript:`, invalid URLs, empty hrefs, and missing hrefs are ignored.

## Worker Pool

The crawler uses a fixed pool of 5 workers.

Shared state:

- `queue`: discovered crawlable URLs
- `queueIndex`: next queue entry to claim
- `seen`: URLs already known/enqueued/seen through redirects
- `crawled`: final URLs already processed
- `inFlight`: URLs currently being processed

Workers terminate only when:

```text
queue is empty AND inFlight === 0
```

This prevents premature shutdown when the queue is temporarily empty while another worker is still fetching a page that may discover more links.

Important atomicity rule: check-and-mark operations stay synchronous, with no `await` between them.

Examples:

- `seen.has(url)` and `seen.add(url)`
- `crawled.has(finalUrl)` and `crawled.add(finalUrl)`
- claiming the next queue item and incrementing `inFlight`

Page output is completion order, not strict BFS order. That is intentional for a concurrent crawler.

## Redirect Handling

`fetchPage.ts` handles redirects manually with:

```ts
fetch(url, { redirect: "manual" })
```

It follows:

```text
301, 302, 303, 307, 308
```

Manual redirect handling gives the crawler visibility into the full redirect chain.

Behaviour:

- relative `Location` headers are resolved with `new URL(location, currentUrl)`
- missing/blank `Location` is a non-retryable failure
- redirect loops are detected within one fetch operation
- max redirects is 20
- redirects outside the crawl boundary are rejected before fetching the external URL
- same-host redirect-chain URLs are added to `seen`
- the final URL is processed once via `crawled`

This avoids future wasted fetches for intermediate redirect URLs.

## Fetch Policy

Defaults:

- request timeout: 10 seconds
- max redirects: 20
- retries after initial attempt: 2
- retry backoff: 250ms, then 500ms

Retryable:

- network/fetch errors
- timeouts
- `429`
- `500`
- `502`
- `503`
- `504`

Non-retryable:

- permanent client errors such as `400`, `401`, `403`, `404`, `410`
- redirect loops
- too many redirects
- missing redirect `Location`
- redirect outside crawl boundary
- unsupported content type

## Rate Limiting

Bounded concurrency is not the same as rate limiting.

The 5-worker pool limits simultaneous requests. Separately, `429 Too Many Requests` applies a shared host cooldown.

If `Retry-After` is valid, it is used. If missing or invalid, the crawler uses a conservative 30-second fallback cooldown.

During cooldown:

- existing in-flight requests are not cancelled
- workers pause before starting new fetches
- workers do not dequeue URLs while waiting

This matters because the crawler only targets one hostname, so a `429` likely represents a host-wide signal.

## Content-Type Filtering

Only HTML pages are parsed.

Accepted:

- `text/html`
- `application/xhtml+xml`

Parameters are allowed:

```text
text/html; charset=utf-8
```

Rejected:

- missing `Content-Type`
- PDFs
- images
- JSON
- CSS
- JavaScript
- binary downloads
- arbitrary text files

Unsupported content types are currently recorded as crawl failures. A future polish pass could split intentional skips from fetch failures.

## Result Model

The crawler streams results through callbacks for CLI output, but also returns structured results:

- `pages`
- `failures`
- `stats`

This is convenient for tests and summary output. For very large production crawls, a streaming-only or storage-backed result path would avoid keeping every page result in memory.

## Known Trade-Offs

- Concurrency is hardcoded to 5 for simplicity.
- There is no crawl budget yet, so very large same-host sites can produce very large crawls.
- Robots.txt is not implemented yet.
- Stats are useful for validation but need naming polish before final presentation.
- The flat file structure is intentional while the project remains small; extracting a frontier/rate-limiter module would make sense only if the orchestration grows further.
