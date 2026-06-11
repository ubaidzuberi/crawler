# Coding Style Fixes

Changes to make the code read more naturally as human-written.

## fetchPage.ts

### Remove `retryAfterMs` from `FetchPageError`

Currently `retryAfterMs` is carried on the thrown error object, which is indirect — the information lives on the HTTP response, not the error. Strip `retryAfterMs` from the class and handle the `Retry-After` header directly inside the retry loop.

```ts
// Before
class FetchPageError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

// After
class FetchPageError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
```

Then in `fetchPage`, read the delay from the response directly before retrying rather than threading it through the error.

---

### Remove HTTP-date parsing from `parseRetryAfterMs`

Parsing the HTTP-date variant of `Retry-After` is over-thorough for this scope. The seconds format covers the real-world cases a single-host CLI crawler will encounter. Remove the `Date.parse` branch:

```ts
// Before
function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) return null;
  const trimmedRetryAfter = retryAfter.trim();
  const delaySeconds = Number(trimmedRetryAfter);
  if (Number.isFinite(delaySeconds) && delaySeconds >= 0) {
    return delaySeconds * 1_000;
  }
  const retryAfterDateMs = Date.parse(trimmedRetryAfter);
  if (Number.isNaN(retryAfterDateMs)) return null;
  return Math.max(0, retryAfterDateMs - Date.now());
}

// After
function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) return null;
  const seconds = Number(retryAfter.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }
  return null;
}
```

---

### Simplify `isAbortError`

The fully defensive duck-typing chain is over-cautious. Node's `fetch` throws a `DOMException` with name `AbortError` — check that directly:

```ts
// Before
function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

// After
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
```

---

### Inline `redirectChainSeen`

A redirect chain is realistically 2-3 hops. Using a parallel `Set` for O(1) loop detection is premature. Use `includes` on the existing array:

```ts
// Before
const redirectChainSeen = new Set(redirectChain);
// ...
if (redirectChainSeen.has(nextUrl)) { ... }
redirectChainSeen.add(nextUrl);

// After
if (redirectChain.includes(nextUrl)) { ... }
// no separate set needed — redirectChain.push(nextUrl) already happens
```

---

### Inline `REDIRECT_STATUSES` and `RETRYABLE_HTTP_STATUSES`

Named Set constants for small fixed sets of status codes is over-extracted. Inline them:

```ts
// Before
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

if (!REDIRECT_STATUSES.has(response.status)) { ... }
throw new FetchPageError(..., RETRYABLE_HTTP_STATUSES.has(response.status), ...);

// After
if (![301, 302, 303, 307, 308].includes(response.status)) { ... }
throw new FetchPageError(..., [429, 500, 502, 503, 504].includes(response.status), ...);
```

---

## crawler.ts

### Inline `countRedirects`

Single call site, pure arithmetic — no need for a named helper:

```ts
// Before
stats.redirectsFollowed += countRedirects(
  fetchedPage.redirectChain,
  requestedUrl,
  finalUrl,
);

// After
stats.redirectsFollowed += fetchedPage.redirectChain
  ? Math.max(0, fetchedPage.redirectChain.length - 1)
  : requestedUrl === finalUrl ? 0 : 1;
```

---

## links.ts

### Separate stats from extraction result

`ExtractedLinks` bundles `linksDiscovered`, `linksIgnored`, and `duplicateLinks` counters into the same return type as the actual links. The crawler is the only caller that uses the counters, and it could maintain them itself. Consider returning just the links and letting the caller count:

```ts
// Simpler return type
export type ExtractedLinks = {
  links: string[];
  crawlableLinks: string[];
};
```

Or keep the stats but acknowledge this is a deliberate choice for testability, not the obvious default.

---

## All files

### Deduplicate `getErrorMessage`

The same 4-line helper exists in `crawler.ts`, `cli.ts`, and `fetchPage.ts`. Move it to a shared location or just inline it — `error instanceof Error ? error.message : String(error)` is short enough not to need a function.
