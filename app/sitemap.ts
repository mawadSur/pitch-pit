import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitch-pit.app";

// Static, public-facing routes. Admin / api / login excluded.
const STATIC_ROUTES = [
  "",
  "/about",
  "/leaderboard",
  "/built",
  "/rules",
  "/feed",
  "/privacy",
  "/terms",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1.0 : 0.7,
  }));

  // Idea pages — only those visible to the public.
  // Failure here shouldn't 500 the sitemap; degrade to static-only.
  let ideaEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("ideas")
      .select("id,updated_at,status")
      .in("status", ["scored", "queued", "building", "built"])
      .order("updated_at", { ascending: false })
      .limit(5000);

    if (data) {
      ideaEntries = data.map((row) => ({
        url: `${SITE_URL}/idea/${row.id}`,
        lastModified: new Date(row.updated_at),
        changeFrequency: "weekly",
        priority: 0.5,
      }));
    }
  } catch (e) {
    console.warn("[sitemap] idea enumeration failed", e);
  }

  return [...staticEntries, ...ideaEntries];
}
