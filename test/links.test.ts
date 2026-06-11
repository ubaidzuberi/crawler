import { extractLinks } from "../src/links";

describe("extractLinks", () => {
  const startUrl = "https://crawlme.monzo.com/";
  const currentPageUrl = "https://crawlme.monzo.com/docs/page";

  it("extracts anchor hrefs and returns normalized crawlable links", () => {
    const html = `
      <a href="./about">About</a>
      <a href="../blog">Blog</a>
      <a href="/contact">Contact</a>
    `;

    expect(extractLinks(html, currentPageUrl, startUrl)).toMatchObject({
      links: [
        "https://crawlme.monzo.com/docs/about",
        "https://crawlme.monzo.com/blog",
        "https://crawlme.monzo.com/contact",
      ],
      crawlableLinks: [
        "https://crawlme.monzo.com/docs/about",
        "https://crawlme.monzo.com/blog",
        "https://crawlme.monzo.com/contact",
      ],
    });
  });

  it("returns all HTTP links separately from same-host crawlable links", () => {
    const html = `
      <a href="/inside">Inside</a>
      <a href="https://monzo.com/">Parent domain</a>
      <a href="https://community.monzo.com/">Other subdomain</a>
      <a href="mailto:support@example.com">Email</a>
    `;

    expect(extractLinks(html, currentPageUrl, startUrl)).toEqual({
      links: [
        "https://crawlme.monzo.com/inside",
        "https://monzo.com/",
        "https://community.monzo.com/",
      ],
      crawlableLinks: ["https://crawlme.monzo.com/inside"],
      linksDiscovered: 4,
      linksIgnored: 1,
      duplicateLinks: 0,
    });
  });

  it("ignores unusable hrefs and non-anchor href attributes", () => {
    const html = `
      <a>No href</a>
      <a href="">Empty href</a>
      <a href="   ">Whitespace href</a>
      <a href="javascript:void(0)">Script</a>
      <span href="/not-an-anchor">Not an anchor</span>
      <a href="/valid">Valid</a>
    `;

    expect(extractLinks(html, currentPageUrl, startUrl)).toMatchObject({
      links: ["https://crawlme.monzo.com/valid"],
      crawlableLinks: ["https://crawlme.monzo.com/valid"],
    });
  });

  it("deduplicates links after normalization while preserving first-seen order", () => {
    const html = `
      <a href="/about">About</a>
      <a href="/first">First</a>
      <a href="/about#team">About team</a>
      <a href="https://CRAWLME.MONZO.COM/first">First duplicate</a>
    `;

    expect(extractLinks(html, currentPageUrl, startUrl)).toMatchObject({
      links: [
        "https://crawlme.monzo.com/about",
        "https://crawlme.monzo.com/first",
      ],
      crawlableLinks: [
        "https://crawlme.monzo.com/about",
        "https://crawlme.monzo.com/first",
      ],
    });
  });

  it("returns empty results for pages with no usable anchors", () => {
    expect(extractLinks("<main><p>No links here", currentPageUrl, startUrl)).toEqual({
      links: [],
      crawlableLinks: [],
      linksDiscovered: 0,
      linksIgnored: 0,
      duplicateLinks: 0,
    });
  });
});
