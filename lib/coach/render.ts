import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { extractJson } from "@/lib/extract-json";
import {
  FOLLOWUPS_SYSTEM_PROMPT,
  ENHANCE_SYSTEM_PROMPT,
  EXPAND_SYSTEM_PROMPT,
  JUDGES_PREVIEW_SYSTEM_PROMPT,
  userPrompt,
  expandUserPrompt,
} from "./prompts";

const followupsSchema = z.object({
  questions: z
    .array(z.string().min(1).max(140))
    .max(3),
});

const enhanceSchema = z.object({
  // Mirrors submitSchema's pitch envelope (60–3500). Min relaxed to 20
  // so a short polish of a borderline pitch still passes; max bumped
  // from 2000 → 3500 to match the homepage ceiling — the previous
  // 2000 cap was rejecting valid polishes of long pitches and
  // surfacing as a generic 502 to the user.
  enhanced: z.string().min(20).max(3500),
});

// Expand schema — output is a full draft from a one-line seed. The
// prompt aims for 400–800 chars; we relax the floor to 200 so a short
// but coherent draft is accepted, and cap at 1500 (above the prompt's
// 1200 ceiling so off-by-a-few responses don't fail).
const expandSchema = z.object({
  draft: z.string().min(200).max(1500),
});

const judgesPreviewSchema = z.object({
  samples: z.object({
    gstack: z.string().min(1).max(360),
    vee: z.string().min(1).max(360),
    robbins: z.string().min(1).max(360),
  }),
});

const PRICE_PER_MTOK = {
  input: 3.0,
  output: 15.0,
  cache_write: 3.75,
  cache_read: 0.3,
} as const;

function logCost(action: string, usage: Anthropic.Usage) {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cost =
    (input * PRICE_PER_MTOK.input) / 1_000_000 +
    (output * PRICE_PER_MTOK.output) / 1_000_000 +
    (cacheWrite * PRICE_PER_MTOK.cache_write) / 1_000_000 +
    (cacheRead * PRICE_PER_MTOK.cache_read) / 1_000_000;
  console.log(
    `[coach:${action}] in=${input} out=${output} cacheW=${cacheWrite} cacheR=${cacheRead} cost=$${cost.toFixed(5)}`,
  );
}

// Followups call — max 256 tokens since the response is just 3 short
// questions. Tight bound keeps cost low even at peak typing rates.
export async function renderFollowups(pitch: string): Promise<string[]> {
  const client = new Anthropic();
  const response = await client.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: [
        {
          type: "text",
          text: FOLLOWUPS_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt(pitch) }],
    },
    { signal: AbortSignal.timeout(12_000) },
  );
  logCost("followups", response.usage);
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const parsed = followupsSchema.parse(extractJson(text));
  return parsed.questions;
}

// Enhance call — bigger token budget because we're returning a full
// polished pitch. 2048 tokens covers up to ~7000 chars output, plenty
// of headroom above the 3500-char schema cap so we never truncate the
// JSON response mid-string.
export async function renderEnhanced(pitch: string): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: ENHANCE_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt(pitch) }],
    },
    { signal: AbortSignal.timeout(20_000) },
  );
  logCost("enhance", response.usage);
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const parsed = enhanceSchema.parse(extractJson(text));
  return parsed.enhanced;
}

// Expand call — takes a one-line seed and generates a rubric-aware
// draft. Uses the same Sonnet model + cache_control treatment as
// enhance. 1024 tokens is plenty for a 400-800 char draft (which fits
// in ~250 tokens) plus the JSON envelope.
export async function renderExpanded(seed: string): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: EXPAND_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: expandUserPrompt(seed) }],
    },
    { signal: AbortSignal.timeout(20_000) },
  );
  logCost("expand", response.usage);
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const parsed = expandSchema.parse(extractJson(text));
  return parsed.draft;
}

// Judges preview — three short reactions in one call. Tight token
// budget; we only need ~30 words per judge.
export async function renderJudgesPreview(
  pitch: string,
): Promise<{ gstack: string; vee: string; robbins: string }> {
  const client = new Anthropic();
  const response = await client.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: JUDGES_PREVIEW_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt(pitch) }],
    },
    { signal: AbortSignal.timeout(15_000) },
  );
  logCost("judges-preview", response.usage);
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const parsed = judgesPreviewSchema.parse(extractJson(text));
  return parsed.samples;
}
