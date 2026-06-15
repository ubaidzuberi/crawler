import { readCliArgs } from "../src/cli";

describe("readCliArgs", () => {
  it("reads the start URL and optional crawl settings", () => {
    expect(readCliArgs(["https://testsite.example/"])).toEqual({
      startUrl: "https://testsite.example/",
      concurrency: undefined,
      delayMs: undefined,
    });

    expect(
      readCliArgs([
        "https://testsite.example/",
        "--delay-ms",
        "500",
        "--concurrency",
        "3",
      ]),
    ).toEqual({
      startUrl: "https://testsite.example/",
      concurrency: 3,
      delayMs: 500,
    });
  });

  it("allows a zero request delay", () => {
    expect(
      readCliArgs(["https://testsite.example/", "--delay-ms", "0"]),
    ).toEqual({
      startUrl: "https://testsite.example/",
      concurrency: undefined,
      delayMs: 0,
    });
  });

  it("rejects invalid request delays", () => {
    for (const delay of ["-1", "1.5", "not-a-number"]) {
      expect(() =>
        readCliArgs(["https://testsite.example/", `--delay-ms=${delay}`]),
      ).toThrow("--delay-ms must be a non-negative integer");
    }
  });

  it("rejects invalid concurrency values", () => {
    for (const concurrency of ["0", "-1", "1.5", "not-a-number"]) {
      expect(() =>
        readCliArgs([
          "https://testsite.example/",
          `--concurrency=${concurrency}`,
        ]),
      ).toThrow("--concurrency must be a positive integer");
    }
  });

  it("rejects unexpected positional arguments", () => {
    expect(() =>
      readCliArgs(["https://testsite.example/", "extra"]),
    ).toThrow("Unexpected argument: extra");
  });
});
