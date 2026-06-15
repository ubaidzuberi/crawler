import { extractLinks } from "../src/links";

describe("extractLinks", () => {
  const startUrl = "https://testsite.example/";
  const currentPageUrl = "https://testsite.example/docs/page";

  it("extracts anchor hrefs and returns normalized crawlable links", () => {
    const html = `
      <a href="./about">About</a>
      <a href="../blog">Blog</a>
      <a href="/contact">Contact</a>
    `;

    expect(extractLinks(html, currentPageUrl, startUrl)).toMatchObject({
      links: [
        "https://testsite.example/docs/about",
        "https://testsite.example/blog",
        "https://testsite.example/contact",
      ],
      crawlableLinks: [
        "https://testsite.example/docs/about",
        "https://testsite.example/blog",
        "https://testsite.example/contact",
      ],
    });
  });

  it("returns all HTTP links separately from same-host crawlable links", () => {
    const html = `
      <a href="/inside">Inside</a>
      <a href="https://example.com/">Parent domain</a>
      <a href="https://community.example/">Other subdomain</a>
      <a href="mailto:support@example.com">Email</a>
    `;

    expect(extractLinks(html, currentPageUrl, startUrl)).toEqual({
      links: [
        "https://testsite.example/inside",
        "https://example.com/",
        "https://community.example/",
      ],
      crawlableLinks: ["https://testsite.example/inside"],
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
      links: ["https://testsite.example/valid"],
      crawlableLinks: ["https://testsite.example/valid"],
    });
  });

  it("deduplicates links after normalization while preserving first-seen order", () => {
    const html = `
      <a href="/about">About</a>
      <a href="/first">First</a>
      <a href="/about#team">About team</a>
      <a href="https://TESTSITE.EXAMPLE/first">First duplicate</a>
    `;

    expect(extractLinks(html, currentPageUrl, startUrl)).toMatchObject({
      links: [
        "https://testsite.example/about",
        "https://testsite.example/first",
      ],
      crawlableLinks: [
        "https://testsite.example/about",
        "https://testsite.example/first",
      ],
    });
  });

  it("returns empty results for pages with no usable anchors", () => {
    expect(extractLinks("<main><p>No links here", currentPageUrl, startUrl)).toEqual({
      links: [],
      crawlableLinks: [],
    });
  });
});
