# Feedback — What Actually Matters for the Interview

---

## Fix Before Submission

### Dead `if (requestedUrl)` guard in `runWorker`

In [crawler.ts:166-181](src/crawler.ts#L166-L181), `takeNextUrl()` only returns `null` when `queueIndex >= queue.length`, but you already guard against that at the top of the loop. Any engineer reading the flow will spot this. It's the clearest "not fully reviewed" signal in the code.

**Fix:** Remove the guard, use a non-null assertion:
```typescript
const requestedUrl = takeNextUrl()!; // non-null: queueIndex < queue.length checked above
```

---

## Have Answers Ready For

### 1. README is missing the "why" — this is the interview

The second email literally says this forms the follow-up discussion. They will ask these questions regardless of language:

- **Why hostname boundary and not subdomain?** Simpler and more predictable — `www.monzo.com` and `monzo.com` are treated as different hosts, which is strict but unambiguous. A subdomain-aware approach requires more complex matching logic for diminishing returns.
- **Why 5 workers / 500ms delay?** Balance between throughput and being polite to the server. Both are opinionated defaults — `requestDelayMs` is already configurable, worker count would be a straightforward extension.
- **Why BFS?** You're implicitly doing BFS. Worth naming it: finds shallow pages first, memory-bounded by width not depth, natural fit for a queue-based worker pool.
- **Why manual redirect following?** So the domain boundary can be enforced mid-chain. If you let `fetch` handle redirects automatically you only see the final URL — you could silently end up fetching off-domain content.
- **Why exponential backoff?** Prevents hammering a server that's already struggling. Standard pattern.
- **Why not robots.txt?** Time constraint. Would be the next thing to add — check on start, respect `Crawl-delay` and `Disallow` rules.
- **What you'd do with more time?** robots.txt, configurable worker count, HEAD-before-GET to skip non-HTML before downloading the body.

Add a short "Design Decisions" section to the README so they read this before the call, not after.

---

### 2. `WORKER_COUNT` is hardcoded but `requestDelayMs` is configurable

They will ask "why 5?" and may notice the inconsistency. Answer: *"It's an opinionated default — 5 concurrent workers is enough to see meaningful parallelism without hammering a typical server. Making it configurable is a one-line CrawlOptions addition I deprioritised given the time constraint. requestDelayMs felt more important to expose because it directly affects server load."*

---

### 3. The concurrency model — and why `p-queue` wasn't used

Any engineer in any language understands worker pools. They will ask you to walk through how workers know when to stop. Be ready to explain:
- Workers sleep on `waitForStateChange()` when the queue is empty but `inFlight > 0` — in-flight requests may still produce more URLs
- When `inFlight === 0` and the queue is empty, all workers terminate
- `notifyStateChanged` wakes sleeping workers whenever a URL is enqueued or a request completes

**If asked why not `p-queue`:** *"p-queue would have been the pragmatic call — the instructions said libraries were allowed. I implemented it manually because I wanted precise control over the termination condition: knowing the queue is empty AND nothing is in-flight simultaneously. I wasn't certain p-queue's `onIdle` semantics would handle URLs discovered via redirects correctly within the same crawl cycle. In hindsight p-queue does handle that, so it's a valid critique of my time allocation — though building it manually meant I could test the termination logic precisely with the `pendingResolves` pattern in the test suite."*

The `waiters` pattern is a condition variable — a legitimate concurrency primitive, not invented complexity. But you should be honest that p-queue was the pragmatic alternative.

---

### 4. Two dedup sets — `seen` vs `crawled`

This is non-obvious and worth explaining proactively. There are two separate sets:

- **`seen`** — keyed on `requestedUrl`. Prevents the same URL from being enqueued twice.
- **`crawled`** — keyed on `finalUrl` (after redirects). Prevents the same page being emitted twice when multiple requested URLs redirect to the same destination.

Without both, `/old-careers` and `/new-careers` both redirecting to `/careers` would emit `/careers` twice. The two-set design handles redirect convergence correctly.

---

### 5. Why `isAllowedRedirect` is injected into `fetchPage` rather than checked at the crawler level

The boundary check happens inside `fetchPage`, not in `processUrl` after the fetch completes. This means if a redirect points off-domain, the crawler **stops fetching** at that point — it doesn't download the off-domain page first and then discard it. This is the correct layering for both correctness and efficiency.

---

### 6. Non-HTML pages are silently skipped, not recorded as failures

A PDF or image linked from a crawled page throws an `unsupportedContentTypeError`, which the crawler catches and discards without recording a failure. This is a deliberate UX decision: a broken link is a failure worth reporting, but a non-HTML resource is expected and reporting it as an error would create noise. Be ready to justify this distinction.

---

### 7. `errors.ts` property-bag approach

They may ask why you didn't use custom error classes. Prepared answer: *"Property bags keep the module flat — no inheritance hierarchy, no `extends`. The predicates act as type guards and the flows are simple enough that duck typing doesn't create ambiguity. The trade-off is the catch logic in `fetchPageOnce` is slightly less obvious than `error instanceof RetryableError` would be — that's the version I'd reach for if the error taxonomy grew."*

---

### 8. `isWithinCrawlBoundary` re-parses the start URL on every call

Conceptually language-agnostic — a Go engineer will notice the repeated parse. Be ready to say: *"I traded a small repeated allocation for a simpler, purely functional API. At this crawl scale it's negligible, but in a high-throughput crawler I'd extract the hostname once and pass it as a string."*

---

### 9. Timeout is per-attempt, not per-crawl

The 10s `AbortSignal.timeout` applies to each individual fetch attempt, not to the overall crawl. A page that retries twice could take up to 30s+ before being recorded as a failure. In a production crawler you might want a per-URL deadline as well. Worth knowing this is a trade-off: per-attempt timeout is simpler and avoids punishing slow-but-valid responses.

---

### 10. Query strings preserved, fragments stripped

`/page?lang=en` and `/page?lang=fr` are treated as separate URLs (correct — they may return different content). `#section` fragments are stripped before deduplication (correct — fragments are client-side only and the server returns the same page). This is worth stating explicitly because getting it backwards would be a visible bug.



RENAME UNIT TESTS TO MAKE THEM SOUND HUMAN