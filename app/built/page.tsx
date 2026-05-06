import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { createClient } from "@/lib/supabase/server";
import { JsonLd, type JsonLdData } from "@/components/seo/JsonLd";
import { GalleryScene, type BuiltIdea } from "./GalleryScene";
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

const BUILT_DESCRIPTION =
  "The graveyard of winners. Every weekly champion built into a live MVP — claimed by the founder, no equity, no fees. To the victor go the tokens.";

export const metadata: Metadata = {
  title: "Gallery — pitch-pit",
  description: BUILT_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/built` },
  openGraph: {
    title: "Gallery — pitch-pit",
    description: BUILT_DESCRIPTION,
    url: `${SITE_URL}/built`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gallery — pitch-pit",
    description: BUILT_DESCRIPTION,
  },
};

const SELECT =
  "id,title,pitch,handle,score,verdict,mvp_url,screenshot_url,updated_at";

async function fetchBuilt(): Promise<BuiltIdea[]> {
  try {
    const supabase = await createClient();
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

  // ItemList structured data — gives search a clean enumeration of the
  // built MVPs (each with an off-site target via mvp_url when available,
  // falling back to the in-app idea page so the entry still resolves).
  const jsonLd: JsonLdData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "pitch-pit · built MVPs",
    url: `${SITE_URL}/built`,
    numberOfItems: ideas.length,
    itemListElement: ideas.map((idea, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: idea.title,
      url: idea.mvp_url ?? `${SITE_URL}/idea/${idea.id}`,
    })),
  };

  return (
    <div
      className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
      style={{ display: "contents" }}
    >
      <JsonLd data={jsonLd} />
      <GalleryScene ideas={ideas} />
    </div>
  );
}
