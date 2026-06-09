# Iteration 2 Notes

Goal: replace the sequential crawl loop with bounded concurrency while keeping the crawler small enough to explain clearly in an interview.

## Planned Behaviour

- Use a fixed-size worker pool with 5 workers.
- Keep crawling limited to the exact same hostname as the starting URL.
- Print each visited URL and the links found on that page.
- Treat "links found" as all normalized HTTP(S) links discovered in anchor tags, including external links.
- Enqueue only the same-host subset of those links.
- Normalize and deduplicate observed HTTP(S) links once, then derive crawlable links with a hostname-boundary check.
- Continue crawling after fetch failures.
- Follow redirects, but reject final URLs outside the crawl boundary.

## Concurrency Decisions

- Shared crawler state will include the queue, queue index, seen URLs, crawled final URLs, and an in-flight counter.
- Workers should only stop when the queue is empty and there are no in-flight fetches.
- URLs should still be marked as seen when enqueued, not after fetch succeeds.
- Check-and-mark operations must stay synchronous, with no `await` between checking a set and adding to it.
- Final redirected URLs should be claimed before processing so two requested URLs redirecting to the same final URL are not both emitted.
- Page output will be in completion order, not strict BFS order.

## Trade-offs

- Completion-order output is simpler and more natural for a concurrent crawler than buffering results to preserve BFS order.
- A hardcoded concurrency of 5 keeps Iteration 2 focused on correctness before adding CLI flags.
- JavaScript's single-threaded execution avoids true memory races, but async interleaving can still create time-of-check/time-of-use bugs if check-and-mark logic is split across `await`.

## Deferred/Skipped Concurrency Considerations

- Configurable concurrency is not added yet because a hardcoded pool of 5 is enough to demonstrate bounded concurrency without adding CLI/API surface area.
- Per-host rate limiting is deferred. This crawler only visits one exact hostname, so rate limiting would mean slowing requests to that one host; robots.txt and retry/backoff behaviour are a better next step for crawler politeness.
- A global max-pages or max-depth guard is not added yet. BFS controls traversal order but does not prevent very large or unbounded URL spaces, so this would be a useful later safety feature rather than a concurrency requirement.
- Deterministic BFS output order is intentionally not preserved. Concurrent crawlers naturally emit pages in completion order, and buffering output to restore BFS order would add complexity without helping the assignment's core requirement.
- Async callback support is deferred. Current callbacks are synchronous and fit the CLI printing use case; supporting async callbacks would require extra decisions around whether workers await output and how callback failures affect crawl progress.
- Explicit cancellation is not added. For the CLI use case, the user can stop the process with `Ctrl+C`; structured cancellation can be considered later if the crawler becomes a library used by longer-running applications.

## Planned Slices

1. Separate links found for printing from crawlable links used for enqueueing.
2. Update crawler results and CLI output to print all links found.
3. Replace the sequential loop with a 5-worker pool.
4. Add tests for concurrency, duplicate discovery, redirect duplicates, temporary empty queues, and failures.
5. Update these notes after implementation details settle.

## Implemented So Far

- Link extraction now returns all normalized HTTP(S) anchor links plus a same-host crawlable subset.
- The crawler emits all found links for each visited page, but only enqueues crawlable same-host links.
- External HTTP(S) links are counted as discovered links, not ignored links.
- The crawler now runs a fixed pool of 5 workers.
- Idle workers wait when the queue is empty but other workers are still in flight.
- Workers are woken when URLs are enqueued or a worker finishes a URL.
- Fetch failures are recorded and the worker continues.
- Unexpected errors from crawler code, parsing, or callbacks reject the crawl instead of being hidden.
- Tests cover concurrent fetching, duplicate discovery across workers, redirect duplicate claiming, and callback error rejection.
