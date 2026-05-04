import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkContent } from "@/lib/content-filter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const patchBodySchema = z.object({
  body: z.string().trim().min(1).max(1000),
});

// PATCH /api/comments/[id]
//
// Edit a comment's body. RLS enforces that only the owner can update —
// the auth-check and filter here are belt-and-suspenders + give clean
// 401/400 responses instead of silent zero-row updates.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const idCheck = idSchema.safeParse(params.id);
  if (!idCheck.success) {
    return NextResponse.json({ error: "Invalid comment id." }, { status: 400 });
  }

  let parsed: z.infer<typeof patchBodySchema>;
  try {
    const json = await req.json();
    const result = patchBodySchema.safeParse(json);
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

  const filter = checkContent(parsed.body);
  if (filter.flagged) {
    return NextResponse.json(
      { error: filter.reason, category: filter.category },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to edit comments." },
      { status: 401 },
    );
  }

  // RLS makes this a no-op if the user doesn't own the row. We use
  // .select() to detect that case and return 403/404 instead of a
  // confusing 200 with no data.
  const { data, error } = await supabase
    .from("comments")
    .update({ body: parsed.body })
    .eq("id", idCheck.data)
    .select("id, user_id, idea_id, body, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Comment not found, or you don't own it." },
      { status: 403 },
    );
  }

  return NextResponse.json({ comment: data });
}

// DELETE /api/comments/[id]
//
// Owner-only. RLS rejects others; cookie-client carries auth.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const idCheck = idSchema.safeParse(params.id);
  if (!idCheck.success) {
    return NextResponse.json({ error: "Invalid comment id." }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to delete comments." },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("comments")
    .delete()
    .eq("id", idCheck.data)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Comment not found, or you don't own it." },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true });
}
