# Review Criteria

This document captures the expectations for reviewing this take-home crawler against the recruiter brief. It is intended as a reference for code review, not as a source of extra product requirements.

## Context

- The candidate is applying for an upper-mid-level engineering role at a fintech.
- The solution should show senior-level maturity through clear tradeoffs, simple design, correctness, and explainability.
- The exercise is timeboxed to around 4 hours, so unnecessary complexity should be treated as a negative signal.
- The follow-up interview will involve discussing the implementation live, so the code should be easy to explain and defend.

## Assignment Requirements

Derived from the recruiter email:

- Build a simple web crawler.
- Given a starting URL, visit each URL found on the same domain/subdomain.
- For `https://crawlme.monzo.com/`, crawl pages on `crawlme.monzo.com`.
- Do not follow external links such as `facebook.com`, `monzo.com`, or `community.monzo.com`.
- Print each URL visited.
- Print the list of links found on each visited page.
- Use an original crawler implementation.
- Do not use crawler frameworks such as Scrapy or Go Colly that hide the crawling logic.
- Libraries for supporting tasks, such as HTML parsing, are acceptable.
- Submit source code as a ZIP file.
- Do not include compiled code or binaries in the ZIP file.
- Spend no more than about 4 hours.

## Engineering Expectations

The brief asks for production-style code and emphasizes software design over UI or fancy output formats. Review the code for:

- Clear module boundaries.
- Readable, explainable control flow.
- Correct crawl-boundary enforcement.
- URL normalization and deduplication.
- Output that clearly groups each visited page with the links found on that page.
- A concurrency model that is useful, bounded, and easy to reason about.
- Error handling that records failures without unnecessarily stopping the whole crawl.
- Sensible retry behavior for transient failures.
- Rate-limit prevention appropriate for a small single-host crawler.
- Tests that cover important behavior without becoming exhaustive or noisy.
- A CLI that is straightforward to run.
- Documentation that explains how to run, test, and understand the main tradeoffs.

## Tooling Expectations

The recruiter explicitly allows pragmatic tooling, including AI coding assistants and libraries/frameworks where appropriate. Review with this interpretation:

- Tooling use is acceptable.
- The candidate must still be able to explain what the code does and why.
- The code should not look like an overcomplicated generated architecture.
- The solution should avoid frameworks that implement the crawler behind the scenes.
- Any library use should support the crawler rather than replace the candidate's own crawler logic.
- The implementation should be locally understandable without requiring hidden context.

## Senior-Maturity Signals

For an upper-mid-level fintech role, the code should ideally show:

- Conservative defaults.
- Explicit tradeoffs.
- Small abstractions that earn their place.
- Failure modes handled deliberately.
- Tests focused on observable behavior.
- Avoidance of unnecessary global state.
- Avoidance of broad, hidden side effects.
- Clear separation between crawling, fetching, URL handling, link extraction, and CLI output.
- Choices that are proportionate to the 4-hour timebox.

## Review Questions

Use these questions when assessing the solution:

- Does the code satisfy the explicit assignment?
- Is the same-domain/subdomain boundary correct and consistently enforced?
- Is the terminal output clear enough to identify each visited page and its discovered links?
- Is concurrency implemented correctly and explainably?
- Are retries and rate-limit prevention proportionate to the assignment scope?
- Are tests sufficient without being bloated?
- Is anything overengineered for a 4-hour take-home task?
- Is anything underexplained or likely to be hard to justify in a live review?
- Are there signs the candidate would struggle to explain the code?
- Are there any holes or vulnerabilities or race conditions that are in the code?
- Does this solution make sense for the assignment? Any conceptual or logical flaws in it?
- Are there any unneccessary additons or considerations that don't apply to a crawler of this scale (only crawling a single host)
- Is the testing reasonable? is anything missing or untested? does the testing strategy make sense? should any tests be added or removed? 
- Are there fintech-relevant maturity concerns, such as unsafe defaults, unclear failure handling, or brittle behavior?
