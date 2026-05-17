import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { titleToSlug } from "@/lib/slug";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

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
      .select("id,title,updated_at,status")
      .in("status", ["scored", "queued", "building", "built"])
      .order("updated_at", { ascending: false })
      .limit(5000);

    if (data) {
      ideaEntries = data.map((row) => {
        // Emit the slugged URL when the title produces one; fall back
        // to bare /idea/<uuid> for emoji-only / non-Latin titles. The
        // page redirects between the two forms so either is crawlable,
        // but the sitemap should declare the canonical target.
        const slug = titleToSlug(row.title ?? "");
        const path = slug ? `/idea/${row.id}/${slug}` : `/idea/${row.id}`;
        return {
          url: `${SITE_URL}${path}`,
          lastModified: new Date(row.updated_at),
          changeFrequency: "weekly",
          priority: 0.5,
        };
      });
    }
  } catch (e) {
    console.warn("[sitemap] idea enumeration failed", e);
  }

  // Recap pages — one per closed/built week. Recaps are immutable
  // editorial artifacts so they get a higher priority than idea pages
  // and never need re-crawling.
  let recapEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("weeks")
      .select("week_number, end_at")
      .in("status", ["closed", "built"])
      .order("week_number", { ascending: false });

    if (data) {
      recapEntries = data.map((row) => ({
        url: `${SITE_URL}/recap/${row.week_number}`,
        lastModified: row.end_at ? new Date(row.end_at) : now,
        changeFrequency: "yearly",
        priority: 0.6,
      }));
    }
  } catch (e) {
    console.warn("[sitemap] recap enumeration failed", e);
  }

  return [...staticEntries, ...recapEntries, ...ideaEntries];
}
