import { parseArgs } from "node:util";
import { crawl } from "./crawler";
import { getErrorMessage } from "./errors";

async function main(): Promise<void> {
  try {
    const args = readCliArgs(process.argv.slice(2));

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

function readCliArgs(args: string[]): CliArgs {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "delay-ms": {
        type: "string",
      },
    },
  });

  if (parsed.positionals.length > 1) {
    throw new Error(`Unexpected argument: ${parsed.positionals[1]}`);
  }

  return {
    startUrl: parsed.positionals[0],
    delayMs:
      parsed.values["delay-ms"] === undefined
        ? undefined
        : parseDelayMs(parsed.values["delay-ms"]),
  };
}

function parseDelayMs(value: string): number {
  const delayMs = Number(value);

  if (!Number.isInteger(delayMs) || delayMs < 0) {
    throw new Error("--delay-ms must be a non-negative integer");
  }

  return delayMs;
}

void main();
