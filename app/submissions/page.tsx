import { redirect } from "next/navigation";
import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/jetbrains-mono";
import { createClient } from "@/lib/supabase/server";
import { SubmissionsScene, type Submission } from "./SubmissionsScene";
import "../scene.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-scene",
  display: "swap",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "My pitches — pitch-pit",
};

const SUBMISSION_SELECT =
  "id,title,pitch,handle,score,final_score,vote_count,verdict,strengths,concerns,reasoning,build_recommended,status,mvp_url,created_at";

export default async function SubmissionsRoute() {
  const supabase = createClient();
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
      className={`${inter.variable} ${jetbrains.variable}`}
      style={{ display: "contents" }}
    >
      <SubmissionsScene submissions={submissions} userLabel={userLabel} />
    </div>
  );
}
