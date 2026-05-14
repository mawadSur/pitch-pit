import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { createAdminClient } from "@/lib/supabase/admin";
import { WinnerScene, type BuildLogEntry } from "./WinnerScene";
import "@/app/scene.css";

// Minimalist route — three-axis fonts loaded per-route, same as /, /idea, /built.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-scene",
  display: "swap",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

interface WinnerPageProps {
  params: Promise<{ ideaId: string }>;
}

export async function generateMetadata(
  props: WinnerPageProps,
): Promise<Metadata> {
  const { ideaId } = await props.params;
  // Server client doesn't see build_queue rows beyond the public select policy,
  // and we want the title on the meta tag — use admin for this read.
  const supabase = createAdminClient();
  const { data: idea } = await supabase
    .from("ideas")
    .select("title, status")
    .eq("id", ideaId)
    .maybeSingle();

  const title = idea?.title
    ? `Building "${idea.title}" — pitch-pit`
    : "Winner — pitch-pit";
  const description = "Live build of this week's pitch-pit winner.";

  // Once the build completes the winner page becomes a permanent
  // monument — surface the polished BUILT card on share. During the
  // live-build phase (status='building') we let Next.js fall back to
  // the static root OG card; rendering a half-built numeral would be
  // misleading.
  const builtOgImage =
    idea?.status === "built"
      ? [
          {
            url: `${SITE_URL}/api/og/${ideaId}`,
            width: 1200,
            height: 630,
            alt: title,
          },
        ]
      : undefined;

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/winner/${ideaId}` },
    openGraph: {
      title,
      description,
      type: "website",
      ...(builtOgImage ? { images: builtOgImage } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(builtOgImage ? { images: builtOgImage.map((i) => i.url) } : {}),
    },
  };
}

export default async function WinnerPage(props: WinnerPageProps) {
  const { ideaId } = await props.params;

  // Admin client because build_queue is publicly readable but we also
  // want callback_token-free fields without thinking about RLS.
  const supabase = createAdminClient();

  const { data: idea } = await supabase
    .from("ideas")
    .select(
      "id, title, pitch, score, final_score, verdict, status, mvp_url, screenshot_url, created_at",
    )
    .eq("id", ideaId)
    .maybeSingle();

  if (!idea) notFound();

  // Only ideas that are currently building or already built belong on the
  // winner surface. A 'scored' or 'submitted' idea has no build to track.
  if (idea.status !== "building" && idea.status !== "built") {
    notFound();
  }

  const { data: queue } = await supabase
    .from("build_queue")
    .select(
      "status, build_phase, retry_count, error, mvp_url, repo_url, build_logs, started_at, completed_at, updated_at",
    )
    .eq("idea_id", ideaId)
    .maybeSingle();

  const initialLogs: BuildLogEntry[] = Array.isArray(queue?.build_logs)
    ? (queue!.build_logs as BuildLogEntry[])
    : [];

  return (
    <div
      className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
      style={{ display: "contents" }}
    >
      <WinnerScene
        idea={{
          id: idea.id,
          title: idea.title,
          pitch: idea.pitch,
          score: idea.score,
          final_score: idea.final_score,
          verdict: idea.verdict,
          status: idea.status,
          mvp_url: idea.mvp_url,
          screenshot_url: idea.screenshot_url,
        }}
        initialQueue={{
          status: queue?.status ?? "in_progress",
          build_phase: queue?.build_phase ?? "queued",
          retry_count: queue?.retry_count ?? 0,
          error: queue?.error ?? null,
          mvp_url: queue?.mvp_url ?? null,
          repo_url: queue?.repo_url ?? null,
          started_at: queue?.started_at ?? null,
          completed_at: queue?.completed_at ?? null,
        }}
        initialLogs={initialLogs}
      />
    </div>
  );
}
