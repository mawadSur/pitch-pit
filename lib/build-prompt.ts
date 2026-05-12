export interface BuildPromptIdea {
  id: string;
  title: string;
  pitch: string;
  score: number;
  final_score: number | null;
  verdict: string;
  strengths: string[] | null;
  concerns: string[] | null;
  reasoning: string | null;
}

function bulletList(items: string[] | null | undefined): string {
  if (!items || items.length === 0) return "- (none)";
  return items.map((item) => `- ${item}`).join("\n");
}

function deriveCta(pitch: string): string {
  const first = pitch.split(/[.!?\n]/)[0].trim();
  return first.length > 0 ? first : "Try the product";
}

export function buildClaudeCodePrompt(
  idea: BuildPromptIdea,
  siteUrl?: string,
): string {
  const base = siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";
  const publicUrl = `${base}/idea/${idea.id}`;
  const adminUrl = `${base}/admin`;

  const finalScore = idea.final_score !== null ? idea.final_score : "N/A";

  return `Build an MVP for this pitch-pit winner.

# Idea
Title: ${idea.title}
Pitch:
${idea.pitch}

# AI rating (from pitch-pit)
Score: ${idea.score}/10
Final score (incl. votes): ${finalScore}/100
Verdict: ${idea.verdict}

Strengths:
${bulletList(idea.strengths)}

Concerns:
${bulletList(idea.concerns)}

Reasoning:
${idea.reasoning ?? "(none)"}

# Suggested stack
- Next.js 15 (App Router) on Vercel
- Supabase (Postgres + Auth + Realtime)
- Tailwind CSS
- TypeScript strict mode

# Scope (MVP)
- One-screen landing page that explains what the product does
- Primary action: ${deriveCta(idea.pitch)}
- Auth via Supabase magic link if user accounts are needed
- A single core table for the main entity, with RLS policies
- Deploy to Vercel preview, share link back

# Deliverables
- Working preview URL
- Brief README with run instructions
- Initial Supabase migration in supabase/migrations/

Reply to this email with the preview URL when shipped.

# Links
- Public idea page: ${publicUrl}
- Admin queue row: ${adminUrl}`;
}
