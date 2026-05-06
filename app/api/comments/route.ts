import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkContent } from "@/lib/content-filter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ideaId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(1, "Say something.")
    .max(1000, "Comments are capped at 1000 characters."),
});

// POST /api/comments — add a comment on an idea.
//
// Same content-filter as /api/score so spam, prompt-injection, and slurs
// are rejected before they hit the database. Auth required (RLS would
// reject anonymous inserts anyway, but failing here gives a cleaner 401).
export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    const result = bodySchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json(
        {
          error: "Comment is malformed.",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    parsed = result.data;
  } catch {
    return NextResponse.json(
      { error: "Could not parse request body." },
      { status: 400 },
    );
  }

  // Synchronous filter — same set of rules we apply to pitches. Catches
  // injection attempts, slurs, spam patterns before they're persisted.
  const filter = checkContent(parsed.body);
  if (filter.flagged) {
    return NextResponse.json(
      { error: filter.reason, category: filter.category },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to leave a comment." },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("comments")
    .insert({
      user_id: user.id,
      idea_id: parsed.ideaId,
      body: parsed.body,
    })
    .select("id, user_id, idea_id, body, created_at, updated_at, is_edited")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not save comment." },
      { status: 500 },
    );
  }

  return NextResponse.json({ comment: data });
}
