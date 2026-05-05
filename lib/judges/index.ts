import { GSTACK_SYSTEM_PROMPT } from "./gstack";
import { VEE_SYSTEM_PROMPT } from "./vee";
import { ROBBINS_SYSTEM_PROMPT } from "./robbins";
import type { JudgeId, JudgeMeta } from "./shared";

export type { JudgeId, JudgeMeta } from "./shared";
export { userPrompt } from "./shared";

export const JUDGES: ReadonlyArray<JudgeMeta & { systemPrompt: string }> = [
  {
    id: "gstack",
    name: "Gstack",
    role: "YC office hours",
    signatureLine: "Render judgment.",
    portrait: "/judges/gstack.svg",
    systemPrompt: GSTACK_SYSTEM_PROMPT,
  },
  {
    id: "vee",
    name: "Gary V",
    role: "Attention & distribution",
    signatureLine: "Patience and empathy.",
    portrait: "/judges/vee.svg",
    systemPrompt: VEE_SYSTEM_PROMPT,
  },
  {
    id: "robbins",
    name: "Tony R",
    role: "Conviction & standards",
    signatureLine: "Raise your standards.",
    portrait: "/judges/robbins.svg",
    systemPrompt: ROBBINS_SYSTEM_PROMPT,
  },
] as const;

export const JUDGE_IDS: ReadonlyArray<JudgeId> = JUDGES.map((j) => j.id);

export function getJudge(id: JudgeId) {
  const j = JUDGES.find((x) => x.id === id);
  if (!j) throw new Error(`Unknown judge id: ${id}`);
  return j;
}
