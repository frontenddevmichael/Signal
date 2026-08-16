import { describe, expect, it } from "vitest";
import { sanitizeHtml, isSafeUrl } from "../convex/sanitizeHtml";

describe("sanitizeHtml (§18 audit fix — note XSS choke point)", () => {
  it("passes through benign TipTap output", () => {
    expect(sanitizeHtml("<p>Hello <strong>world</strong></p>")).toBe(
      "<p>Hello <strong>world</strong></p>"
    );
  });

  it("strips <script> and turns it into inert text", () => {
    const out = sanitizeHtml("<p>x</p><script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("turns non-allowlisted tags into inert escaped text", () => {
    const out = sanitizeHtml('<p><img src=x onerror="alert(1)">hi</p>');
    // The whole <img ...> construct becomes ESCAPED TEXT — visible but inert.
    // No live <img> element, no executable attribute.
    expect(out).toBe('<p>&lt;img src=x onerror="alert(1)"&gt;hi</p>');
    expect(out).not.toContain("<img");
    expect(out).not.toContain('<img src');
  });

  it("rejects javascript: links but keeps http(s)/relative", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="https://ok.com">x</a>')).toBe(
      '<a href="https://ok.com">x</a>'
    );
    expect(sanitizeHtml('<a href="/relative">x</a>')).toBe('<a href="/relative">x</a>');
    expect(sanitizeHtml('<a href="mailto:a@b.com">x</a>')).toBe(
      '<a href="mailto:a@b.com">x</a>'
    );
  });

  it("strips attributes from non-anchor tags", () => {
    expect(sanitizeHtml('<span style="color:red">x</span>')).toBe("<span>x</span>");
  });

  it("handles lists and headings", () => {
    const out = sanitizeHtml("<ul><li>one</li><li>two</li></ul><h3>Head</h3>");
    expect(out).toBe("<ul><li>one</li><li>two</li></ul><h3>Head</h3>");
  });

  it("escapes raw text so it can't be reinterpreted", () => {
    const out = sanitizeHtml("<p>2 &lt; 3 &amp; 4</p>");
    expect(out).toBe("<p>2 &lt; 3 &amp; 4</p>");
  });

  it("nullifies unclosed tags", () => {
    expect(sanitizeHtml("<p>text <script>alert(1)")).toBe("<p>text &lt;script&gt;alert(1)");
  });

  it("does not double-encode existing entities", () => {
    expect(sanitizeHtml("<p>Tom &amp; Jerry</p>")).toBe("<p>Tom &amp; Jerry</p>");
  });
});

describe("isSafeUrl", () => {
  it("rejects dangerous schemes", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeUrl("vbscript:x")).toBe(false);
  });
  it("accepts safe schemes and relatives", () => {
    expect(isSafeUrl("https://x.com")).toBe(true);
    expect(isSafeUrl("http://x.com")).toBe(true);
    expect(isSafeUrl("mailto:a@b.com")).toBe(true);
    expect(isSafeUrl("/path")).toBe(true);
    expect(isSafeUrl("#anchor")).toBe(true);
  });
});
