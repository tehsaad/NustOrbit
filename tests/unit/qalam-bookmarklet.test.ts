import { describe, expect, it } from "vitest";
import { QALAM_BOOKMARKLET, QALAM_BOOKMARKLET_SOURCE } from "@/lib/qalam-bookmarklet";

describe("Qalam export bookmarklet", () => {
  it("is a javascript: URL built from the readable source", () => {
    expect(QALAM_BOOKMARKLET.startsWith("javascript:")).toBe(true);
    expect(decodeURIComponent(QALAM_BOOKMARKLET.slice("javascript:".length))).toBe(QALAM_BOOKMARKLET_SOURCE);
  });
  it("only runs on qalam and makes no network calls (reads tables, downloads CSV)", () => {
    expect(QALAM_BOOKMARKLET_SOURCE).toContain("qalam");
    expect(QALAM_BOOKMARKLET_SOURCE).toMatch(/querySelectorAll\("table"\)/);
    expect(QALAM_BOOKMARKLET_SOURCE).toContain("Blob");
    // No fetch/XHR/credential handling in the bookmarklet.
    expect(QALAM_BOOKMARKLET_SOURCE).not.toMatch(/fetch\(|XMLHttpRequest|password|localStorage/i);
  });
});
