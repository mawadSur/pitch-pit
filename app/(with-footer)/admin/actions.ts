"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { sendBuildNotification } from "@/lib/email";

const ADMIN_PATHS = ["/admin", "/feed", "/leaderboard", "/built"] as const;

function revalidateAll(ideaId?: string) {
  for (const p of ADMIN_PATHS) revalidatePath(p);
  if (ideaId) {
    // Revalidate every variant under /idea/<id>: bare and slugged.
    // "layout" matches the segment + all nested catch-all paths.
    revalidatePath(`/idea/${ideaId}`, "layout");
  }
}

export async function greenlightIdea(ideaId: string) {
  // requireAdmin() returns the Supabase user object on success, null
  // otherwise. We don't distinguish "no session" from "session but not
  // admin" here — both collapse to a single Unauthorized error.
  // This guard MUST run in every action because Next Server Actions
  // can be POSTed to any route's Next-Action endpoint (not just /admin),
  // which means middleware's path-bound auth gate alone is not enough.
  const adminUser = await requireAdmin();
  if (!adminUser) return { error: "Unauthorized." };
  if (!ideaId) return { error: "Missing tribute id." };
  const supabase = createAdminClient();

  const { error: ideaErr } = await supabase
    .from("ideas")
    .update({ status: "queued" })
    .eq("id", ideaId);
  if (ideaErr) return { error: ideaErr.message };

  const { error: queueErr } = await supabase.from("build_queue").upsert(
    {
      idea_id: ideaId,
      status: "approved",
      approved_at: new Date().toISOString(),
    },
    { onConflict: "idea_id" },
  );
  if (queueErr) return { error: queueErr.message };

  revalidateAll(ideaId);
  return { ok: true };
}

export async function rejectIdea(ideaId: string) {
  // requireAdmin() returns the Supabase user object on success, null
  // otherwise. We don't distinguish "no session" from "session but not
  // admin" here — both collapse to a single Unauthorized error.
  // This guard MUST run in every action because Next Server Actions
  // can be POSTed to any route's Next-Action endpoint (not just /admin),
  // which means middleware's path-bound auth gate alone is not enough.
  const adminUser = await requireAdmin();
  if (!adminUser) return { error: "Unauthorized." };
  if (!ideaId) return { error: "Missing tribute id." };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("ideas")
    .update({ status: "rejected" })
    .eq("id", ideaId);
  if (error) return { error: error.message };
  revalidateAll(ideaId);
  return { ok: true };
}

export async function startBuilding(ideaId: string) {
  // requireAdmin() returns the Supabase user object on success, null
  // otherwise. We don't distinguish "no session" from "session but not
  // admin" here — both collapse to a single Unauthorized error.
  // This guard MUST run in every action because Next Server Actions
  // can be POSTed to any route's Next-Action endpoint (not just /admin),
  // which means middleware's path-bound auth gate alone is not enough.
  const adminUser = await requireAdmin();
  if (!adminUser) return { error: "Unauthorized." };
  if (!ideaId) return { error: "Missing tribute id." };
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: idea, error: fetchErr } = await supabase
    .from("ideas")
    .select("id,title,pitch,score,final_score,verdict,strengths,concerns,reasoning")
    .eq("id", ideaId)
    .single();
  if (fetchErr) return { error: fetchErr.message };

  const { error: ideaErr } = await supabase
    .from("ideas")
    .update({ status: "building" })
    .eq("id", ideaId);
  if (ideaErr) return { error: ideaErr.message };

  const { error: queueErr } = await supabase
    .from("build_queue")
    .update({ status: "in_progress", started_at: now })
    .eq("idea_id", ideaId);
  if (queueErr) return { error: queueErr.message };

  revalidateAll(ideaId);

  // Best-effort email — never block or surface errors to the admin caller.
  try {
    await sendBuildNotification(idea);
  } catch (err) {
    console.error("[startBuilding] Failed to send build notification:", err);
  }

  return { ok: true };
}

export async function markBuilt(formData: FormData) {
  // requireAdmin() returns the Supabase user object on success, null
  // otherwise. We don't distinguish "no session" from "session but not
  // admin" here — both collapse to a single Unauthorized error.
  // This guard MUST run in every action because Next Server Actions
  // can be POSTed to any route's Next-Action endpoint (not just /admin),
  // which means middleware's path-bound auth gate alone is not enough.
  const adminUser = await requireAdmin();
  if (!adminUser) return { error: "Unauthorized." };

  const ideaId = String(formData.get("ideaId") ?? "");
  const mvpUrl = String(formData.get("mvpUrl") ?? "").trim();
  const screenshotUrl =
    String(formData.get("screenshotUrl") ?? "").trim() || null;

  if (!ideaId) return { error: "Missing tribute id." };
  if (!mvpUrl) return { error: "An mvp_url is required." };
  try {
    new URL(mvpUrl);
  } catch {
    return { error: "mvp_url is not a valid URL." };
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { error: ideaErr } = await supabase
    .from("ideas")
    .update({
      status: "built",
      mvp_url: mvpUrl,
      screenshot_url: screenshotUrl,
    })
    .eq("id", ideaId);
  if (ideaErr) return { error: ideaErr.message };

  const { error: queueErr } = await supabase
    .from("build_queue")
    .update({
      status: "complete",
      mvp_url: mvpUrl,
      completed_at: now,
    })
    .eq("idea_id", ideaId);
  if (queueErr) return { error: queueErr.message };

  revalidateAll(ideaId);
  return { ok: true };
}

export async function cancelBuild(ideaId: string) {
  // requireAdmin() returns the Supabase user object on success, null
  // otherwise. We don't distinguish "no session" from "session but not
  // admin" here — both collapse to a single Unauthorized error.
  // This guard MUST run in every action because Next Server Actions
  // can be POSTed to any route's Next-Action endpoint (not just /admin),
  // which means middleware's path-bound auth gate alone is not enough.
  const adminUser = await requireAdmin();
  if (!adminUser) return { error: "Unauthorized." };
  if (!ideaId) return { error: "Missing tribute id." };
  const supabase = createAdminClient();

  // Only ideas that are mid-pipeline can be cancelled. Guard up front so an
  // out-of-band call can't, say, revert a built MVP back to 'scored'.
  const { data: idea, error: fetchErr } = await supabase
    .from("ideas")
    .select("status")
    .eq("id", ideaId)
    .single();
  if (fetchErr) return { error: fetchErr.message };
  if (!idea) return { error: "Idea not found." };
  if (idea.status !== "queued" && idea.status !== "building") {
    return {
      error: `Cannot cancel a build for an idea in '${idea.status}'.`,
    };
  }

  // Revert the idea out of the build pipeline back to the neutral
  // post-judgment state. High-scoring ideas re-surface under "Pending
  // review", where an admin can greenlight (and re-dispatch) them again.
  const { error: ideaErr } = await supabase
    .from("ideas")
    .update({ status: "scored" })
    .eq("id", ideaId);
  if (ideaErr) return { error: ideaErr.message };

  // Drop the build_queue row. Deleting it also invalidates the
  // callback_token, so any callback from a dispatch already in flight on the
  // GitHub builder 404s and is ignored — that's the practical "stop" for a
  // remote build we can't reach in to kill directly.
  const { error: queueErr } = await supabase
    .from("build_queue")
    .delete()
    .eq("idea_id", ideaId);
  if (queueErr) return { error: queueErr.message };

  revalidateAll(ideaId);
  return { ok: true };
}
