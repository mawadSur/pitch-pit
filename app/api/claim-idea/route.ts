import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ideaId: z.string().uuid(),
});

// POST /api/claim-idea
//
// Lets a signed-in user attach a previously anonymous idea to their account.
// Only succeeds when ideas.user_id IS NULL — once claimed, it can't be
// re-claimed by anyone else. Idempotent: if the same user re-claims, the
// update is a no-op (matched 0 rows) and we return ok=true.
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { ideaId } = parsed.data;

  const cookieClient = await createCookieClient();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in required to claim an idea." },
      { status: 401 },
    );
  }

  // Read with admin client so we can see user_id regardless of RLS read rules.
  const admin = createAdminClient();
  const { data: idea, error: fetchErr } = await admin
    .from("ideas")
    .select("id, user_id")
    .eq("id", ideaId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!idea) {
    return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  }
  if (idea.user_id !== null && idea.user_id !== user.id) {
    return NextResponse.json(
      { error: "This idea has already been claimed." },
      { status: 403 },
    );
  }
  if (idea.user_id === user.id) {
    return NextResponse.json({ ok: true, alreadyClaimed: true });
  }

  // Atomic claim: only succeeds if user_id IS NULL at update time.
  const { error: updateErr, data: updated } = await admin
    .from("ideas")
    .update({ user_id: user.id })
    .eq("id", ideaId)
    .is("user_id", null)
    .select("id")
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (!updated) {
    // Race: someone else claimed between read and update.
    return NextResponse.json(
      { error: "This idea was claimed by someone else." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
