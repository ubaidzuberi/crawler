import { extractLinks, extractLinksWithStats } from "../src/links";

describe("extractLinks", () => {
  const startUrl = "https://crawlme.monzo.com/";
  const currentPageUrl = "https://crawlme.monzo.com/docs/page";

  it("extracts crawlable links from anchor hrefs", () => {
    const html = `
      <html>
        <body>
          <a href="https://crawlme.monzo.com/about">About</a>
          <a href="/pricing">Pricing</a>
          <a href="../help">Help</a>
        </body>
      </html>
    `;

    expect(extractLinks(html, currentPageUrl, startUrl)).toEqual([
      "https://crawlme.monzo.com/about",
      "https://crawlme.monzo.com/pricing",
      "https://crawlme.monzo.com/help",
    ]);
  });

  it("filters links that are outside the crawl boundary", () => {
    const html = `
      <a href="https://monzo.com/">Parent domain</a>
      <a href="https://community.monzo.com/">Other subdomain</a>
      <a href="https://facebook.com/monzo">External</a>
      <a href="/inside">Inside</a>
    `;

    expect(extractLinks(html, currentPageUrl, startUrl)).toEqual([
      "https://crawlme.monzo.com/inside",
    ]);
  });

  it("returns all HTTP links separately from crawlable links", () => {
    const html = `
      <a href="/inside">Inside</a>
      <a href="https://monzo.com/">Parent domain</a>
      <a href="https://community.monzo.com/">Other subdomain</a>
      <a href="https://facebook.com/monzo">External</a>
      <a href="mailto:support@example.com">Email</a>
    `;

    expect(extractLinksWithStats(html, currentPageUrl, startUrl)).toMatchObject({
      links: [
        "https://crawlme.monzo.com/inside",
        "https://monzo.com/",
        "https://community.monzo.com/",
        "https://facebook.com/monzo",
      ],
      crawlableLinks: ["https://crawlme.monzo.com/inside"],
      linksDiscovered: 5,
      linksIgnored: 1,
      duplicateLinks: 0,
    });
  });

  it("ignores anchors without usable hrefs", () => {
    const html = `
      <a>No href</a>
      <a href="">Empty href</a>
      <a href="   ">Whitespace href</a>
      <a href="mailto:support@example.com">Email</a>
      <span href="/not-an-anchor">Not an anchor</span>
      <a href="/valid">Valid</a>
    `;

    expect(extractLinks(html, currentPageUrl, startUrl)).toEqual([
      "https://crawlme.monzo.com/valid",
    ]);
  });

  it("deduplicates links after normalization", () => {
    const html = `
      <a href="/about">About</a>
      <a href="/about#team">Team</a>
      <a href="https://CRAWLME.MONZO.COM/about">Duplicate with uppercase host</a>
    `;

    expect(extractLinks(html, currentPageUrl, startUrl)).toEqual([
      "https://crawlme.monzo.com/about",
    ]);
  });

  it("preserves the order links are discovered in the document", () => {
    const html = `
      <a href="/first">First</a>
      <a href="/second">Second</a>
      <a href="/third">Third</a>
    `;

    expect(extractLinks(html, currentPageUrl, startUrl)).toEqual([
      "https://crawlme.monzo.com/first",
      "https://crawlme.monzo.com/second",
      "https://crawlme.monzo.com/third",
    ]);
  });
});
