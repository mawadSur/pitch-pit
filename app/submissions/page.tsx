import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { createClient } from "@/lib/supabase/server";
import { SubmissionsScene, type Submission } from "./SubmissionsScene";
import "../scene.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-scene",
  display: "swap",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUBMISSIONS_DESCRIPTION =
  "Your pitches in the pit — scores, verdicts, vote counts, build status. Two lifetime submissions, infinite chances to vote on someone else's.";

export const metadata: Metadata = {
  title: "My pitches — pitch-pit",
  description: SUBMISSIONS_DESCRIPTION,
  // Auth-gated route — keep search engines out so they don't index a
  // permanent /login redirect as the canonical page content.
  robots: { index: false, follow: false },
  alternates: { canonical: `${SITE_URL}/submissions` },
  openGraph: {
    title: "My pitches — pitch-pit",
    description: SUBMISSIONS_DESCRIPTION,
    url: `${SITE_URL}/submissions`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "My pitches — pitch-pit",
    description: SUBMISSIONS_DESCRIPTION,
  },
};

const SUBMISSION_SELECT =
  "id,title,pitch,handle,score,final_score,vote_count,verdict,strengths,concerns,reasoning,build_recommended,status,mvp_url,created_at";

export default async function SubmissionsRoute() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/submissions")}`);
  }

  const { data, error } = await supabase
    .from("ideas")
    .select(SUBMISSION_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const submissions = error || !data ? [] : (data as Submission[]);
  const userLabel =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    "you";

  return (
    <div
      className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
      style={{ display: "contents" }}
    >
      <SubmissionsScene submissions={submissions} userLabel={userLabel} />
    </div>
  );
}
