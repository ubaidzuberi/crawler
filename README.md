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

## Defaults

The crawler uses up to 5 concurrent workers.

By default, each worker waits 500ms before starting a request. This is intended to avoid sending too many requests to the target site at once.

You can reduce `--delay-ms` to crawl faster, or increase it if the target site is returning too many rate-limit responses.

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

The crawl boundary is based on the hostname. `http://crawlme.monzo.com/page` and `https://crawlme.monzo.com/page` are both considered within the same crawl boundary, but `https://monzo.com/` and `https://community.monzo.com/` are not.

Only `http` and `https` links are included. Links such as `mailto:`, `tel:`, `javascript:`, and malformed URLs are ignored.

URL fragments are removed before links are deduplicated, so `/about#team` is treated as `/about`.

Query strings are preserved, so `/search?q=one` and `/search?q=two` are treated as different URLs.

Path differences are preserved. For example, `/about`, `/about/`, and `/About` are treated as different URLs.

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

## Notes

The crawler uses `node-html-parser` for HTML parsing. The crawling, URL normalisation, deduplication, redirect handling, retries, and output behaviour are manually implemented in this project.

## Limitations

This crawler does not read or enforce `robots.txt`.

There is no maximum crawl depth. The crawl stops when there are no new same-hostname URLs left to visit.
