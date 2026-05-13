// Pure-function tests for lib/judges/shared.ts.
//
// userPrompt() and userMessageContent() build the user-side payload
// each judge sees. The block ordering matters — the pitch text leads,
// images come second-to-last, and "Render judgment." is always the
// final block.

import { describe, expect, it } from "vitest";
import { userMessageContent, userPrompt } from "./shared";

describe("userPrompt (text-only)", () => {
  it("formats title + pitch with the trailing render judgment line", () => {
    const out = userPrompt("My Idea", "Build a thing.");
    expect(out).toContain("IDEA TITLE: My Idea");
    expect(out).toContain("THE PITCH:");
    expect(out).toContain("Build a thing.");
    expect(out.trim().endsWith("Render judgment.")).toBe(true);
  });
});

describe("userMessageContent (multimodal)", () => {
  it("returns text-only blocks with no image attachments", () => {
    const blocks = userMessageContent("My Idea", "Build a thing.", []);
    // First block: title + pitch. Last block: render judgment.
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      type: "text",
      text: "IDEA TITLE: My Idea\n\nTHE PITCH:\nBuild a thing.",
    });
    expect(blocks[1]).toEqual({ type: "text", text: "Render judgment." });
  });

  it("inserts a single-image hint plus 1 image block when one URL is provided", () => {
    const blocks = userMessageContent("T", "P", ["https://x/a.jpg"]);
    // 1 text framing + 1 image hint + 1 image + 1 "render judgment"
    expect(blocks).toHaveLength(4);
    expect(blocks[0].type).toBe("text");
    // Single-image hint uses "image" (singular) — important so the
    // model copy reads naturally and isn't off-by-one.
    expect(blocks[1]).toEqual({
      type: "text",
      text: expect.stringContaining("1 image "),
    });
    expect(blocks[2]).toEqual({
      type: "image",
      source: { type: "url", url: "https://x/a.jpg" },
    });
    expect(blocks[3]).toEqual({ type: "text", text: "Render judgment." });
  });

  it("uses plural 'images' in the hint when 2+ URLs are provided", () => {
    const urls = [
      "https://x/a.jpg",
      "https://x/b.jpg",
      "https://x/c.jpg",
    ];
    const blocks = userMessageContent("T", "P", urls);
    // text framing + hint + 3 images + render = 6 blocks
    expect(blocks).toHaveLength(6);
    expect((blocks[1] as { text: string }).text).toContain("3 images");
    // Image blocks preserve url order.
    expect(blocks[2]).toEqual({
      type: "image",
      source: { type: "url", url: urls[0] },
    });
    expect(blocks[3]).toEqual({
      type: "image",
      source: { type: "url", url: urls[1] },
    });
    expect(blocks[4]).toEqual({
      type: "image",
      source: { type: "url", url: urls[2] },
    });
    expect(blocks[5]).toEqual({
      type: "text",
      text: "Render judgment.",
    });
  });

  it("never alters the title/pitch substrings in the framing block", () => {
    const title = "Title with — em dashes and \"quotes\"";
    const pitch = "Pitch with\nmultiple\nlines and special <chars>";
    const blocks = userMessageContent(title, pitch, []);
    const first = (blocks[0] as { text: string }).text;
    expect(first).toContain(title);
    expect(first).toContain(pitch);
  });
});
