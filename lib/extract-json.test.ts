import { describe, it, expect } from "vitest";
import { extractJson } from "./extract-json";

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    const out = extractJson(`{"score": 7, "verdict": "sharp"}`);
    expect(out).toEqual({ score: 7, verdict: "sharp" });
  });

  it("strips ```json fences", () => {
    const out = extractJson('```json\n{"score": 5}\n```');
    expect(out).toEqual({ score: 5 });
  });

  it("strips bare ``` fences", () => {
    const out = extractJson('```\n{"score": 3}\n```');
    expect(out).toEqual({ score: 3 });
  });

  it("ignores prose before and after the object", () => {
    const out = extractJson(
      `Here's my judgment:\n{"score": 8, "verdict": "real"}\n— that's the take.`,
    );
    expect(out).toEqual({ score: 8, verdict: "real" });
  });

  it("uses outermost braces when there's nested noise", () => {
    // Nested objects mean lastIndexOf must beat the inner }
    const out = extractJson(`{"score": 4, "details": {"k": 1}}`);
    expect(out).toEqual({ score: 4, details: { k: 1 } });
  });

  it("throws when there's no JSON object at all", () => {
    expect(() => extractJson("nothing here")).toThrow(/No JSON object/);
  });

  it("throws on malformed JSON inside the brace window", () => {
    expect(() => extractJson("{not: valid json}")).toThrow();
  });
});
