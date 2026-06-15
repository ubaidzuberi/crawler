# Monzo Crawler

This is a simple web crawler that when given a starting URL will visit pages on the same hostname, print each visited page and print the links found on that page. Links to other hostnames are included in the page output when they are found, but they are not crawled.

## Setup

```bash
npm install
```

## Run

```bash
npm run crawl -- https://crawlme.monzo.com/
```

With no request delay:

```bash
npm run crawl -- https://crawlme.monzo.com/ --delay-ms 0
```

With a custom delay between requests:

```bash
npm run crawl -- https://crawlme.monzo.com/ --delay-ms 500
```

With a custom concurrency limit:

```bash
npm run crawl -- https://crawlme.monzo.com/ --concurrency 3
```

## Defaults

The crawler uses up to 5 concurrent workers.

By default, each worker waits 500ms before starting a request. This is intended to avoid sending too many requests to the target site at once.

You can reduce `--delay-ms` or increase `--concurrency` to crawl faster, or increase `--delay-ms` and reduce `--concurrency` if the target site is returning too many rate-limit responses.

## Output

The crawler prints visited pages and the links found on each page to stdout.

Each visited page is printed on its own line. Links found on that page are printed underneath with indentation.

Example:

```text
https://crawlme.monzo.com/
  - https://crawlme.monzo.com/page-a
  - https://crawlme.monzo.com/page-b
  - https://monzo.com/
```

Fetch failures and CLI errors are printed to stderr.

## Crawler Behaviour

As per the assignment outline, the crawl boundary is based on the hostname.

Only `http` and `https` links are included. Links such as `mailto:`, `tel:`, `javascript:`, and malformed URLs are ignored.

External links are included in the printed links for a page, but they are not crawled.

Redirects are followed only while the redirect target stays within the same hostname.

URL fragments are removed before links are deduplicated, so `/about#team` is treated as `/about`.

Query strings are preserved, so `/search?q=one` and `/search?q=two` are treated as different URLs.

Path differences are preserved. For example, `/about`, `/about/`, and `/About` are treated as different URLs.

Non-HTML same-host resources, such as PDFs and images, are skipped rather than printed as visited pages.

## Saving Output

Save normal crawler output only:

```bash
npm run crawl -- https://crawlme.monzo.com/ > output.txt
```

Save errors only:

```bash
npm run crawl -- https://crawlme.monzo.com/ 2> errors.txt
```

Save normal output and errors separately:

```bash
npm run crawl -- https://crawlme.monzo.com/ > output.txt 2> errors.txt
```

Save normal output and errors together:

```bash
npm run crawl -- https://crawlme.monzo.com/ > output.txt 2>&1
```

Show only normal output in the terminal:

```bash
npm run crawl -- https://crawlme.monzo.com/ 2>/dev/null
```

## Test

```bash
npm test
npm run typecheck
```

## Design Choices

### Configurable crawl pressure & rate limits

Rate limits are usually handled with both prevention and cooldowns. Given more time, I would've added a cooldown, so if any worker received a `429`, all workers would pause until the `Retry-After` period has passed. I chose not to add that here because coordinating and testing a shared cooldown across concurrent workers would add extra complexity within the timebox.

Instead, this crawler handles rate limiting in two simpler ways. Firstly, `--concurrency` and `--delay-ms` let the caller reduce crawl pressure and lower the chance of hitting rate limits in the first place. Secondly, when a URL receives a `429`, the fetch layer respects `Retry-After` for that URL's retry, using the larger of the exponential backoff delay and the `Retry-After` delay.

The trade-off is that other workers may continue making requests while one URL is waiting to retry, so this is not a complete rate-limiting strategy. It is a simpler prevention-focused approach with per-request cooldown behaviour. Since the crawler targets a single host, `--concurrency` and `--delay-ms` can be tuned for that host if rate limits appear.

### Manual redirect handling

Redirects are followed manually so the crawler can enforce the same-host boundary before fetching each redirect target. This avoids following a redirect chain off the original host and only realising after the final page has been loaded. Although this added additional complexity, I felt this was necessary as it aligned with the assignment instructions of "should not follow external links".

### Two layers of deduplication

There are 2 sets, `seen` and `crawled`. `seen` tracks normalised requested URLs so the same URL is not queued twice. `crawled` tracks final URLs after redirects so multiple URLs that redirect to the same page are only emitted once, preventing the crawler from parsing the same page more than once.

### URL normalisation choices

Fragments are stripped because they refer to client-side page sections, while query strings are preserved because they can represent different server responses. Path casing and trailing slash differences are preserved.

### HTML pages vs non-HTML resources

The crawler only records successfully fetched HTML documents as visited pages. Same-host PDFs, images, and other non-HTML resources are skipped rather than printed or treated as broken links.

### Retry and timeout behaviour

Each fetch attempt has a 10s timeout. Failure codes are categorised into retryable failures, such as `5xx`, `408`, and `429`, and non-retryable failures, such as most `4xx` responses. Retryable failures are retried twice with exponential backoff starting at 1s, and `Retry-After` is respected for rate limits.

Retries are handled inside `fetchPage()` rather than by re-adding failed URLs to the crawler queue. This keeps the queue dedicated for unvisited pages, while the fetch layer owns transient network behaviour such as timeouts, retryable status codes, `Retry-After`, and exponential backoff. This keeps the implementation and tests simpler.

The trade-off is that a worker remains occupied while a URL is waiting to retry, however, for a single-host crawler that is an acceptable trade-off.

### What is intentionally not included

This crawler does not read or enforce `robots.txt`. Although this is important for a production crawler, the crawler is functional without it so I chose to not allocate time towards handling it.

There is no maximum crawl depth. The crawl stops when there are no new same-hostname URLs left to visit. This was not added as the assignment mentioned that the crawler should "visit each URL it finds on the same domain". Adding a crawl depth could potentially interfere with that. 

The crawler does not implement graceful shutdown or checkpointing. I left this out because the CLI streams pages and failures as they are discovered, so already-emitted output is preserved by the terminal or by normal shell redirection to files. For example, if stdout is redirected to `output.txt`, pages printed before an interruption remain in that file.
