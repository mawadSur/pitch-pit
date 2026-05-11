import { SiteFooter } from "@/components/SiteFooter";

// Route group for every route that closes with the manifesto footer —
// the "To the victor go the tokens" closing line + small legal nav.
// Covers /about, /admin, /built, /feed, /judge/[token], /leaderboard,
// /login, /privacy, /rules, /submissions, /terms, plus /auth/callback
// (the OAuth landing route — user redirects away too fast to see chrome,
// but grouping it here keeps the placement uniform).
//
// The two surfaces that opt out (`/` and `/idea/[id]`) live in
// (no-footer)/ instead. SiteFooter no longer needs a pathname check —
// it just renders whatever the group hands it.
export default function WithFooterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <SiteFooter />
    </>
  );
}
