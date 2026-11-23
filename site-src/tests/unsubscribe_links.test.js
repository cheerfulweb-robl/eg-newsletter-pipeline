import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Reads the real UNSUB_LINK regex from the send-email function, so this test breaks if it changes.
const src = readFileSync(resolve(process.cwd(), "../supabase/functions/send-email/index.ts"), "utf8");
const m = src.match(/^const UNSUB_LINK = \/(.+)\/g;$/m);
const UNSUB_LINK = new RegExp(m[1], "g");
const sign = (html, token = "tok-123") => html.replace(UNSUB_LINK, `$1?token=${token}`);
const base = "https://welcomeeg.ca/news/unsubscribe.html";

describe("send-email unsubscribe link signing", () => {
  it("replaces an ?email= link with the recipient's token", () => {
    expect(sign(`<a href="${base}?email=a%40b.ca">x</a>`)).toBe(`<a href="${base}?token=tok-123">x</a>`);
  });
  it("replaces token=manage and an empty token", () => {
    expect(sign(`<a href="${base}?token=manage">x</a>`)).toBe(`<a href="${base}?token=tok-123">x</a>`);
    expect(sign(`<a href="${base}?token=">x</a>`)).toBe(`<a href="${base}?token=tok-123">x</a>`);
  });
  it("leaves a real token alone", () => {
    const html = `<a href="${base}?token=6f1c2b9e-0000-4000-8000-000000000000">x</a>`;
    expect(sign(html)).toBe(html);
  });
  it("leaves a token that only starts with 'manage' alone", () => {
    const html = `<a href="${base}?token=manageXYZ">x</a>`;
    expect(sign(html)).toBe(html);
  });
  it("replaces every link in the email", () => {
    const html = `<a href="${base}?email=a">1</a><a href='${base}?token=manage'>2</a>`;
    expect(sign(html).match(/token=tok-123/g)).toHaveLength(2);
  });
});
