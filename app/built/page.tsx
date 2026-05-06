import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { createClient } from "@/lib/supabase/server";
import { GalleryScene, type BuiltIdea } from "./GalleryScene";
import "../scene.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-scene",
  display: "swap",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Gallery — pitch-pit",
};

const SELECT =
  "id,title,pitch,handle,score,verdict,mvp_url,screenshot_url,updated_at";

async function fetchBuilt(): Promise<BuiltIdea[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("ideas")
      .select(SELECT)
      .eq("status", "built")
      .not("mvp_url", "is", null)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (error || !data) return [];
    return data as BuiltIdea[];
  } catch {
    return [];
  }
}

export default async function BuiltRoute() {
  const ideas = await fetchBuilt();
  return (
    <div
      className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
      style={{ display: "contents" }}
    >
      <GalleryScene ideas={ideas} />
    </div>
  );
}
