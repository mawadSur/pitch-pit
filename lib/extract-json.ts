// Pulls a JSON object out of LLM output. Tolerates:
// - leading/trailing whitespace
// - ```json fences (or bare ```)
// - prose chatter before/after the object (uses first { ... last } window)
// Throws on input with no { ... } at all.
export function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1) {
    throw new Error(
      `No JSON object found in reviewer output: ${text.slice(0, 200)}`,
    );
  }
  return JSON.parse(cleaned.slice(first, last + 1));
}
