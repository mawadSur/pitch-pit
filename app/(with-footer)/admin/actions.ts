"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminFromServerAction } from "@/lib/admin-auth";
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
  const auth = await requireAdminFromServerAction();
  if (!auth.ok) return { error: auth.error };
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
  const auth = await requireAdminFromServerAction();
  if (!auth.ok) return { error: auth.error };
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
  const auth = await requireAdminFromServerAction();
  if (!auth.ok) return { error: auth.error };
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
  const auth = await requireAdminFromServerAction();
  if (!auth.ok) return { error: auth.error };

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
