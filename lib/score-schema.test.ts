import { describe, it, expect } from "vitest";
import { submitSchema, scoreSchema } from "./score-schema";

const MIN_PITCH = "a".repeat(60);

describe("submitSchema", () => {
  it("accepts a minimal valid submission", () => {
    const r = submitSchema.safeParse({ title: "x", pitch: MIN_PITCH });
    expect(r.success).toBe(true);
  });

  it("rejects pitches under 60 chars", () => {
    const r = submitSchema.safeParse({ title: "x", pitch: "too short" });
    expect(r.success).toBe(false);
  });

  it("rejects pitches over 3500 chars", () => {
    const r = submitSchema.safeParse({
      title: "x",
      pitch: "a".repeat(3501),
    });
    expect(r.success).toBe(false);
  });

  it("rejects titles over 80 chars", () => {
    const r = submitSchema.safeParse({
      title: "a".repeat(81),
      pitch: MIN_PITCH,
    });
    expect(r.success).toBe(false);
  });

  it("treats empty handle as valid (optional)", () => {
    const r = submitSchema.safeParse({
      title: "x",
      pitch: MIN_PITCH,
      handle: "",
    });
    expect(r.success).toBe(true);
  });
});

const VALID_SCORE = {
  score: 7,
  verdict: "Sharp wedge in a market the giants ignore.",
  strengths: ["Real demand signal", "Founder edge plausible"],
  concerns: ["Distribution unclear", "Defensibility thin"],
  reasoning: "Strong founder/market fit but distribution path unclear.",
  build_recommended: true,
};

describe("scoreSchema", () => {
  it("accepts a complete reviewer response", () => {
    const r = scoreSchema.safeParse({
      ...VALID_SCORE,
      moderation_flag: false,
      moderation_reason: "",
    });
    expect(r.success).toBe(true);
  });

  it("defaults moderation fields when reviewer omits them (back-compat)", () => {
    const r = scoreSchema.safeParse(VALID_SCORE);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.moderation_flag).toBe(false);
      expect(r.data.moderation_reason).toBe("");
    }
  });

  it("preserves a moderation refusal", () => {
    const r = scoreSchema.safeParse({
      ...VALID_SCORE,
      moderation_flag: true,
      moderation_reason: "hate speech",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.moderation_flag).toBe(true);
      expect(r.data.moderation_reason).toBe("hate speech");
    }
  });

  it("rejects scores out of 1-10 range", () => {
    expect(scoreSchema.safeParse({ ...VALID_SCORE, score: 0 }).success).toBe(
      false,
    );
    expect(scoreSchema.safeParse({ ...VALID_SCORE, score: 11 }).success).toBe(
      false,
    );
  });

  it("rejects fractional scores", () => {
    expect(scoreSchema.safeParse({ ...VALID_SCORE, score: 7.5 }).success).toBe(
      false,
    );
  });

  it("rejects empty strengths or concerns arrays", () => {
    expect(
      scoreSchema.safeParse({ ...VALID_SCORE, strengths: [] }).success,
    ).toBe(false);
    expect(
      scoreSchema.safeParse({ ...VALID_SCORE, concerns: [] }).success,
    ).toBe(false);
  });
});
