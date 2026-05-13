// Integration tests for renderJudgment (lib/judges/render-judgment.ts).
//
// renderJudgment calls Anthropic with the selected judge's system
// prompt, parses the response through extractJson + scoreSchema, and
// returns a validated ScoreResult. We mock the Anthropic SDK at the
// module boundary so we can:
//   - assert the right judge prompt is dispatched
//   - assert images are forwarded in the user message content blocks
//   - confirm the JSON-extraction → schema-parse pipeline rejects garbage

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AnthropicCall = {
  model: string;
  max_tokens: number;
  system: Array<{ type: string; text: string; cache_control?: unknown }>;
  messages: Array<{
    role: string;
    content: Array<{ type: string; text?: string; source?: unknown }>;
  }>;
};

let lastCall: AnthropicCall | null = null;
let nextResponseText = "";

vi.mock("server-only", () => ({}));

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class Anthropic {
      messages = {
        create: async (cfg: AnthropicCall) => {
          lastCall = cfg;
          return {
            content: [{ type: "text", text: nextResponseText }],
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          };
        },
      };
    },
  };
});

import { renderJudgment } from "./render-judgment";

const VALID_JSON = JSON.stringify({
  score: 7,
  verdict: "Sharp wedge in a crowded market.",
  strengths: ["clear demand", "founder edge plausible"],
  concerns: ["distribution unclear", "defensibility thin"],
  reasoning: "Strong founder/market fit but distribution path unclear.",
  build_recommended: true,
  moderation_flag: false,
  moderation_reason: "",
});

beforeEach(() => {
  lastCall = null;
  nextResponseText = VALID_JSON;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("renderJudgment", () => {
  it("uses Sonnet 4.6 and dispatches the gstack system prompt for judgeId=gstack", async () => {
    const out = await renderJudgment("gstack", "Title", "Pitch text");
    expect(out.score).toBe(7);
    expect(lastCall).not.toBeNull();
    expect(lastCall!.model).toBe("claude-sonnet-4-6");
    expect(lastCall!.system).toHaveLength(1);
    expect(lastCall!.system[0].text).toMatch(/gstack|garry|tan|YC/i);
    expect(lastCall!.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("forwards images as content blocks in the user message", async () => {
    await renderJudgment("vee", "Title", "Pitch", [
      "https://x/a.jpg",
      "https://x/b.jpg",
    ]);
    const userContent = lastCall!.messages[0].content;
    const imageBlocks = userContent.filter((b) => b.type === "image");
    expect(imageBlocks).toHaveLength(2);
    expect(imageBlocks[0].source).toEqual({
      type: "url",
      url: "https://x/a.jpg",
    });
    expect(imageBlocks[1].source).toEqual({
      type: "url",
      url: "https://x/b.jpg",
    });
  });

  it("uses the robbins system prompt when judgeId=robbins", async () => {
    await renderJudgment("robbins", "T", "P");
    expect(lastCall!.system[0].text).toMatch(/robbins|standards/i);
  });

  it("returns a parsed + validated ScoreResult", async () => {
    const out = await renderJudgment("gstack", "T", "Pitch");
    expect(out).toMatchObject({
      score: 7,
      verdict: "Sharp wedge in a crowded market.",
      build_recommended: true,
      moderation_flag: false,
    });
    expect(out.strengths).toEqual(["clear demand", "founder edge plausible"]);
  });

  it("tolerates fenced JSON output (extractJson strips markdown fences)", async () => {
    nextResponseText = "```json\n" + VALID_JSON + "\n```";
    const out = await renderJudgment("gstack", "T", "P");
    expect(out.score).toBe(7);
  });

  it("throws (via zod) when the model returns valid JSON with a wrong shape", async () => {
    nextResponseText = JSON.stringify({ score: 11, verdict: "x" });
    await expect(renderJudgment("gstack", "T", "P")).rejects.toThrow();
  });

  it("throws on totally unparseable model output", async () => {
    nextResponseText = "not json at all, just prose";
    await expect(renderJudgment("gstack", "T", "P")).rejects.toThrow();
  });
});
