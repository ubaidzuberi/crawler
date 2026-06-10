import { crawl } from "./crawler";

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));

    if (!args.startUrl) {
      console.error("Usage: npm run crawl -- <url> [--delay-ms <milliseconds>]");
      process.exitCode = 1;
      return;
    }

    const result = await crawl(args.startUrl, {
      requestDelayMs: args.delayMs,
      onPage: (page) => {
        console.log(page.url);

        for (const link of page.links) {
          console.log(`  - ${link}`);
        }
      },
      onFailure: (failure) => {
        console.error(`${failure.url}: ${failure.error}`);
      },
    });

    console.log("\nCrawl complete");
    console.log(`Start URL: ${result.stats.startUrl}`);
    console.log(`Pages visited: ${result.stats.pagesVisited}`);
    console.log(`Links discovered: ${result.stats.linksDiscovered}`);
    console.log(`Internal links queued: ${result.stats.internalLinksQueued}`);
    console.log(`Ignored links: ${result.stats.linksIgnored}`);
    console.log(`Failed fetches: ${result.stats.failedFetches}`);
    console.log(`Duplicate URLs skipped: ${result.stats.duplicateUrlsSkipped}`);
    console.log(`Redirects followed: ${result.stats.redirectsFollowed}`);
    console.log(`Redirect duplicates skipped: ${result.stats.redirectDuplicatesSkipped}`);
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exitCode = 1;
  }
}

type CliArgs = {
  startUrl?: string;
  delayMs?: number;
};

function parseArgs(args: string[]): CliArgs {
  const parsed: CliArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--delay-ms") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("--delay-ms requires a value");
      }

      parsed.delayMs = parseDelayMs(value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--delay-ms=")) {
      parsed.delayMs = parseDelayMs(arg.slice("--delay-ms=".length));
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (parsed.startUrl) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    parsed.startUrl = arg;
  }

  return parsed;
}

function parseDelayMs(value: string): number {
  const delayMs = Number(value);

  if (!Number.isInteger(delayMs) || delayMs < 0) {
    throw new Error("--delay-ms must be a non-negative integer");
  }

  return delayMs;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

void main();
