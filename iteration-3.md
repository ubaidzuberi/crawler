# Iteration 3 Notes

Goal: make the crawler more robust and production-style without turning it into a crawler framework.

## Candidate Scope

- Replace automatic fetch redirects with manual redirect handling.
- Add retries with backoff for transient fetch failures.
- Decide which HTTP status codes should be retried and which should fail immediately.
- Add content-type filtering so only HTML pages are parsed for links.
- Revisit URL canonicalisation decisions that are not handled by JavaScript's `URL` API.

## Manual Redirect Handling

Current behaviour uses Node fetch's automatic redirect handling. This gives the crawler the originally requested URL and the final URL, but hides intermediate redirect hops.

Iteration 3 will move redirect handling into `fetchPage` by using `fetch(url, { redirect: "manual" })`.

Planned behaviour:

- Follow redirect statuses `301`, `302`, `303`, `307`, and `308`.
- Resolve relative `Location` headers against the current URL.
- Return the full same-host redirect chain to the crawler.
- Add same-host URLs from the redirect chain to the crawler's `seen` set so future discoveries of intermediate redirect URLs can be skipped.
- Reject redirects as soon as a target leaves the crawl boundary, instead of fetching the external final page.
- Detect redirect loops inside a single fetch operation with a local redirect-chain set.
- Enforce a maximum redirect count, likely 20.
- Fail when a redirect response is missing a usable `Location` header.

Why this is worth adding:

- Avoids future wasted fetches for intermediate redirect URLs.
- Makes external redirects cheaper because the crawler can stop before fetching the external page.
- Produces clearer redirect-loop and invalid-redirect failures.
- Gives the crawler explicit control over redirect limits and stats.

Trade-off:

- This adds responsibility to `fetchPage` that Node fetch previously handled automatically, so it needs focused tests.

Implemented decisions:

- `fetchPage` now follows redirects manually with `redirect: "manual"`.
- `FetchedPage` includes `redirectChain` for real fetches.
- The crawler passes an `isAllowedRedirect` boundary predicate into the fetcher.
- External redirect targets are rejected before fetching the external URL.
- The crawler adds same-host redirect-chain URLs to `seen`, so later discoveries of intermediate redirect URLs can be skipped.
- Redirect stats now count redirect hops from the returned chain when available.

## Retry Questions

- Retry transient network errors and timeouts?
- Retry `429 Too Many Requests`?
- Retry `500`, `502`, `503`, and `504`?
- Avoid retrying permanent client errors like `400`, `401`, `403`, and `404`?
- Use a small fixed retry count, for example 2 retries after the first attempt?
- Use exponential backoff with jitter so workers do not retry in lockstep?
- Should retries live inside `fetchPage`, keeping crawler orchestration unchanged?

## Retry Decisions

- Retries live inside `fetchPage`, so crawler orchestration and worker-pool logic do not need to know about retry policy.
- Default retry policy is 2 retries after the initial attempt.
- Backoff is exponential with a 250ms base delay: first retry waits 250ms, second retry waits 500ms.
- Jitter is intentionally not added because this is a single CLI crawler, not a distributed system with many clients retrying in lockstep.
- The default per-request timeout is 10 seconds.
- `429 Too Many Requests` applies a shared host-level cooldown before workers start new fetches.
- Valid `Retry-After` headers are used for the shared cooldown and for the retrying request's own delay.
- Missing or invalid `Retry-After` on a `429` uses a conservative default 30 second cooldown.
- Existing in-flight requests are not cancelled when a cooldown starts; the cooldown only pauses future request starts.
- Bounded concurrency and host cooldown solve different problems: 5 workers limits simultaneous requests, while cooldown responds to site-wide rate limiting.

Retryable failures:

- Network or fetch-level errors.
- Request timeouts.
- `429 Too Many Requests`.
- `500 Internal Server Error`.
- `502 Bad Gateway`.
- `503 Service Unavailable`.
- `504 Gateway Timeout`.

Non-retryable failures:

- Permanent client errors such as `400`, `401`, `403`, `404`, and `410`.
- Other non-retryable HTTP statuses unless explicitly added later.
- Redirect target outside the crawl boundary.
- Redirect loops.
- Too many redirects.
- Redirect responses missing a usable `Location` header.

Trade-off:

- Host cooldown is global because the crawler intentionally stays on one exact hostname. If the crawler later supports multiple hosts, this should become per-host cooldown state.

## Content-Type Questions

- Only parse pages whose response `Content-Type` is HTML.
- Treat missing content type as HTML or as unsupported?
- Do not parse PDFs, images, downloads, JSON, or CSS as HTML.
- Decide whether unsupported content types count as failures or skipped pages.

## Content-Type Decisions

- Content-type filtering lives in `fetchPage`, after a successful final response and before reading the body.
- Accepted content types are only `text/html` and `application/xhtml+xml`.
- Content-type parameters are allowed, for example `text/html; charset=utf-8`.
- Missing `Content-Type` is rejected.
- All other content types are rejected, including PDFs, images, JSON, CSS, JavaScript, binary downloads, and arbitrary text files.
- Unsupported content type is non-retryable because retrying the same URL should not change the resource type.
- Unsupported content type is currently recorded by the crawler as a failure. This keeps the result model small; a future polish pass could split intentional skips from fetch failures.

## URL Canonicalisation Questions

JavaScript's `URL` API already resolves relative links, lowercases hostnames, removes default ports, strips fragments when we set `hash = ""`, and serializes URLs consistently.

Manual canonicalisation decisions still open:

- Whether `/about` and `/about/` should be treated as the same URL.
- Whether `/` and `/index.html` should be treated as the same URL.
- Whether query parameters should be sorted.
- Whether tracking parameters like `utm_source` should be removed.
- Whether empty query strings should be removed.
- Whether `http` and `https` URLs on the same hostname should be treated as different pages.

## URL Canonicalisation Decisions

Principle: normalize URL syntax with platform APIs, but do not guess semantic equivalence that depends on server behaviour.

Handled by JavaScript's `URL` API and current code:

- Bare host URLs normalize to a trailing root slash, so `https://books.toscrape.com` becomes `https://books.toscrape.com/`.
- Relative links are resolved against the current page URL.
- Hostnames are lowercased.
- Default ports are removed.
- Dot segments in paths are normalized.
- Fragments are removed because they point within the same page.

Manual canonicalisation intentionally not added:

- `/about` and `/about/` are treated as different URLs.
- `/` and `/index.html` are treated as different URLs.
- Query parameters are not sorted.
- Tracking parameters such as `utm_source` are not removed.
- Empty query parameters are not removed.
- `http` and `https` URLs on the same hostname are treated as different URLs.

Why:

- Servers can route these URL forms differently.
- If the server wants to canonicalize one form to another, redirect handling will observe that and deduplicate the final URL.
- Aggressive canonicalisation can incorrectly skip valid pages, so it should be configurable or domain-specific rather than a default.

## Initial Leaning

- Keep URL canonicalisation conservative. Aggressive merging can skip real pages if the server treats URLs differently.
- Add manual redirect handling first because it changes the fetch boundary and affects retry/content-type design.
- Add retries/backoff before robots.txt because retries are mostly contained at the fetch boundary.
- Add content-type filtering with the fetch boundary because it depends on response headers.
- Defer robots.txt to a separate iteration unless Iteration 3 stays small.
