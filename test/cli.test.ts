import { readCliArgs } from "../src/cli";

describe("readCliArgs", () => {
  it("reads the start URL and optional request delay", () => {
    expect(readCliArgs(["https://testsite.example/"])).toEqual({
      startUrl: "https://testsite.example/",
      delayMs: undefined,
    });

    expect(
      readCliArgs(["https://testsite.example/", "--delay-ms", "500"]),
    ).toEqual({
      startUrl: "https://testsite.example/",
      delayMs: 500,
    });
  });

  it("allows a zero request delay", () => {
    expect(
      readCliArgs(["https://testsite.example/", "--delay-ms", "0"]),
    ).toEqual({
      startUrl: "https://testsite.example/",
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

  it("rejects unexpected positional arguments", () => {
    expect(() =>
      readCliArgs(["https://testsite.example/", "extra"]),
    ).toThrow("Unexpected argument: extra");
  });
});
