import { describe, it, expect } from "vitest";
import { buildClaudeCodePrompt } from "./build-prompt";
import type { BuildPromptIdea } from "./build-prompt";

const FAKE_IDEA: BuildPromptIdea = {
  id: "abc-123",
  title: "AI Meal Planner",
  pitch:
    "A tool that generates weekly meal plans based on dietary restrictions and budget. Users get a grocery list and step-by-step recipes.",
  score: 8,
  final_score: 72,
  verdict: "Strong product with clear demand.",
  strengths: ["Clear value proposition", "Solves a real pain point"],
  concerns: ["Crowded market", "Data freshness for prices"],
  reasoning:
    "The idea addresses a common frustration with meal planning and has a clear monetisation path.",
};

const SITE_URL = "https://pitchpit.app";

describe("buildClaudeCodePrompt", () => {
  it("includes the idea title", () => {
    const prompt = buildClaudeCodePrompt(FAKE_IDEA, SITE_URL);
    expect(prompt).toContain("Title: AI Meal Planner");
  });

  it("includes the AI score out of 10", () => {
    const prompt = buildClaudeCodePrompt(FAKE_IDEA, SITE_URL);
    expect(prompt).toContain("Score: 8/10");
  });

  it("includes the final score out of 100", () => {
    const prompt = buildClaudeCodePrompt(FAKE_IDEA, SITE_URL);
    expect(prompt).toContain("Final score (incl. votes): 72/100");
  });

  it("includes the verdict", () => {
    const prompt = buildClaudeCodePrompt(FAKE_IDEA, SITE_URL);
    expect(prompt).toContain("Verdict: Strong product with clear demand.");
  });

  it("includes strengths as bullets", () => {
    const prompt = buildClaudeCodePrompt(FAKE_IDEA, SITE_URL);
    expect(prompt).toContain("- Clear value proposition");
    expect(prompt).toContain("- Solves a real pain point");
  });

  it("includes concerns as bullets", () => {
    const prompt = buildClaudeCodePrompt(FAKE_IDEA, SITE_URL);
    expect(prompt).toContain("- Crowded market");
    expect(prompt).toContain("- Data freshness for prices");
  });

  it("includes the public idea URL", () => {
    const prompt = buildClaudeCodePrompt(FAKE_IDEA, SITE_URL);
    expect(prompt).toContain(`Public idea page: ${SITE_URL}/idea/abc-123`);
  });

  it("includes the admin URL", () => {
    const prompt = buildClaudeCodePrompt(FAKE_IDEA, SITE_URL);
    expect(prompt).toContain(`Admin queue row: ${SITE_URL}/admin`);
  });

  it("handles null final_score gracefully", () => {
    const idea = { ...FAKE_IDEA, final_score: null };
    const prompt = buildClaudeCodePrompt(idea, SITE_URL);
    expect(prompt).toContain("Final score (incl. votes): N/A/100");
  });

  it("handles null strengths gracefully", () => {
    const idea = { ...FAKE_IDEA, strengths: null };
    const prompt = buildClaudeCodePrompt(idea, SITE_URL);
    expect(prompt).toContain("- (none)");
  });

  it("includes the pitch text", () => {
    const prompt = buildClaudeCodePrompt(FAKE_IDEA, SITE_URL);
    expect(prompt).toContain(FAKE_IDEA.pitch);
  });

  it("includes the reasoning", () => {
    const prompt = buildClaudeCodePrompt(FAKE_IDEA, SITE_URL);
    expect(prompt).toContain(FAKE_IDEA.reasoning!);
  });
});
