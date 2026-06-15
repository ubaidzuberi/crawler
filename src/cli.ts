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

    await crawl(args.startUrl, {
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

  } catch (error) {
    console.error(getErrorMessage(error));
    process.exitCode = 1;
  }
}

export type CliArgs = {
  startUrl?: string;
  delayMs?: number;
};

export function readCliArgs(args: string[]): CliArgs {
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

if (require.main === module) {
  void main();
}
