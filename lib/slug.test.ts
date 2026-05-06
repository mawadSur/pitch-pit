import { describe, it, expect } from "vitest";
import { titleToSlug } from "./slug";

describe("titleToSlug", () => {
  it("kebab-cases plain ASCII titles", () => {
    expect(titleToSlug("Gold-Standard Loyalty App")).toBe(
      "gold-standard-loyalty-app",
    );
  });

  it("strips diacritics and emoji", () => {
    expect(titleToSlug("Idea #3 — Ergonômic… mice 🐭")).toBe(
      "idea-3-ergonomic-mice",
    );
    expect(titleToSlug("Café résumé")).toBe("cafe-resume");
  });

  it("returns empty string for emoji-only or non-Latin titles", () => {
    expect(titleToSlug("🐭🐭🐭")).toBe("");
    expect(titleToSlug("中文标题")).toBe("");
    expect(titleToSlug("   ")).toBe("");
    expect(titleToSlug("")).toBe("");
  });

  it("collapses runs of punctuation/whitespace into a single hyphen", () => {
    expect(titleToSlug("Hello   ---  world!!!")).toBe("hello-world");
  });

  it("caps at 60 chars without splitting a word", () => {
    // 70 chars total — should back off to the last hyphen ≤ 60.
    const title =
      "this is a deliberately very long title that exceeds the max slug length";
    const out = titleToSlug(title);
    expect(out.length).toBeLessThanOrEqual(60);
    // No leading/trailing dash
    expect(out.startsWith("-")).toBe(false);
    expect(out.endsWith("-")).toBe(false);
    // Whatever survived must be a prefix (mid-word break is forbidden,
    // so the surviving slug should be a hyphen-separated prefix of
    // the full slug).
    const full =
      "this-is-a-deliberately-very-long-title-that-exceeds-the-max-slug-length";
    expect(full.startsWith(out)).toBe(true);
  });

  it("hard-cuts at 60 when there's no hyphen to back off to", () => {
    const title = "a".repeat(80);
    const out = titleToSlug(title);
    expect(out).toBe("a".repeat(60));
  });

  it("lowercases and trims hyphens", () => {
    expect(titleToSlug("---HELLO---")).toBe("hello");
  });
});
