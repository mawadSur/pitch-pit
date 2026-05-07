import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ideaId: z.string().uuid(),
});

// Postgres "undefined column" — pre-migration-018 environments don't yet
// have ideas.claim_token. Treated as "no claim token to verify" — the
// route falls back to legacy behavior (signed-in user can claim any
// unclaimed idea), losing the cookie integrity check on that environment.
const UNDEFINED_COLUMN = "42703";

// POST /api/claim-idea
//
// Lets a signed-in user attach a previously anonymous idea to their account.
// Only succeeds when ideas.user_id IS NULL — once claimed, it can't be
// re-claimed by anyone else. Idempotent: if the same user re-claims, the
// update is a no-op (matched 0 rows) and we return ok=true.
//
// Two paths the claim can take:
//   1. Original-submitter path: the requester has the pp_claim_<draft.id>
//      cookie minted at draft creation, AND its value matches the
//      ideas.claim_token we copied across in persistJudgment(). Proves
//      the requester is the same browser that submitted the anonymous
//      draft. They can claim even if they signed in AFTER seeing the
//      verdict.
//   2. Legacy path (no claim_token on the row): older anonymous ideas
//      that predate migration 018 don't have a claim_token. Any signed-in
//      user can claim them — preserves pre-existing behavior so already-
//      deployed ideas stay claimable through the original
//      ClaimAnonymous CTA in components/idea/Reveal.tsx.
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

  // Read with admin client so we can see user_id + claim_token regardless
  // of RLS. We need claim_token to enforce the cookie-bound claim path.
  const admin = createAdminClient();

  type IdeaRow = {
    id: string;
    user_id: string | null;
    claim_token?: string | null;
  };

  let idea: IdeaRow | null = null;
  let fetchErr: { code?: string; message?: string } | null = null;

  {
    const result = await admin
      .from("ideas")
      .select("id, user_id, claim_token")
      .eq("id", ideaId)
      .maybeSingle();
    idea = result.data as IdeaRow | null;
    fetchErr = result.error ?? null;
  }

  if (fetchErr?.code === UNDEFINED_COLUMN) {
    // Pre-018 environment — drop claim_token from the select.
    const fallback = await admin
      .from("ideas")
      .select("id, user_id")
      .eq("id", ideaId)
      .maybeSingle();
    idea = fallback.data as IdeaRow | null;
    fetchErr = fallback.error ?? null;
  }

  if (fetchErr) {
    return NextResponse.json(
      { error: fetchErr.message ?? "Lookup failed" },
      { status: 500 },
    );
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

  // Cookie integrity check — only enforced when the idea actually has a
  // claim_token. The cookie is pp_claim_<draft.id>; we don't store
  // draft.id on ideas, so we scan the cookie store for any pp_claim_*
  // cookie whose value matches the idea's claim_token. This avoids a
  // second DB hit and tolerates the common case where the originating
  // draft has already been GC'd.
  if (idea.claim_token) {
    const cookieStore = await cookies();
    const claimCookies = cookieStore
      .getAll()
      .filter((c) => c.name.startsWith("pp_claim_"));
    const tokenMatches = claimCookies.some(
      (c) => c.value === idea!.claim_token,
    );
    if (!tokenMatches) {
      return NextResponse.json(
        {
          error:
            "This anonymous idea can only be claimed from the browser that submitted it.",
          category: "claim-cookie-missing",
        },
        { status: 403 },
      );
    }
  }

  // Atomic claim: only succeeds if user_id IS NULL at update time.
  // Also clear claim_token so the cookie can't be replayed against the
  // now-claimed idea. Pre-018 fallback drops claim_token from the
  // update payload.
  let updated: { id: string } | null = null;
  let updateErr: { code?: string; message?: string } | null = null;

  {
    const result = await admin
      .from("ideas")
      .update({ user_id: user.id, claim_token: null })
      .eq("id", ideaId)
      .is("user_id", null)
      .select("id")
      .maybeSingle();
    updated = result.data ?? null;
    updateErr = result.error ?? null;
  }

  if (updateErr?.code === UNDEFINED_COLUMN) {
    const retry = await admin
      .from("ideas")
      .update({ user_id: user.id })
      .eq("id", ideaId)
      .is("user_id", null)
      .select("id")
      .maybeSingle();
    updated = retry.data ?? null;
    updateErr = retry.error ?? null;
  }

  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message ?? "Update failed" },
      { status: 500 },
    );
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
