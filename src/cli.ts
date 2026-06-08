import { crawl } from "./crawler";

async function main(): Promise<void> {
  const startUrl = process.argv[2];

  if (!startUrl) {
    console.error("Usage: npm run crawl -- <url>");
    process.exitCode = 1;
    return;
  }

  try {
    const result = await crawl(startUrl, {
      onPage: (page) => {
        console.log(page.url);

        for (const link of page.links) {
          console.log(`  ${link}`);
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

void main();
