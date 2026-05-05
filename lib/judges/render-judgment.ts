import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { scoreSchema, type ScoreResult } from "@/lib/score-schema";
import { extractJson } from "@/lib/extract-json";
import { getJudge, userPrompt, type JudgeId } from "./index";

// Sonnet 4.6 pricing per million tokens (USD).
const PRICE_PER_MTOK = {
  input: 3.0,
  output: 15.0,
  cache_write: 3.75,
  cache_read: 0.3,
} as const;

// Calls the named judge against (title, pitch) and returns a validated
// ScoreResult. Throws on Anthropic / parse / schema failure — the caller
// (the streaming server component) decides whether to surface a per-judge
// error card or retry.
export async function renderJudgment(
  judgeId: JudgeId,
  title: string,
  pitch: string,
): Promise<ScoreResult> {
  const judge = getJudge(judgeId);
  const client = new Anthropic();

  // Per-call timeout — bound each judge to 25s so a single stalled call
  // can't consume the whole 60s page maxDuration and starve the other
  // two judges mid-stream. AbortError here surfaces as a thrown error
  // to the per-judge Suspense boundary; JudgeCard catches it and renders
  // an errored card while AggregateBand falls back to the partial panel.
  const response = await client.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: judge.systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt(title, pitch) }],
    },
    { signal: AbortSignal.timeout(25_000) },
  );

  logCost(judgeId, response.usage);

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return scoreSchema.parse(extractJson(text));
}

function logCost(judgeId: JudgeId, usage: Anthropic.Usage) {
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
    `[judge:${judgeId}] in=${input} out=${output} cacheW=${cacheWrite} cacheR=${cacheRead} cost=$${cost.toFixed(5)}`,
  );
}
