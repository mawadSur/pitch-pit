// Shape produced by the homepage's server-side data fetch in
// app/(no-footer)/page.tsx and threaded into the client tree.
// Extracted to its own module so both the data fetcher (server) and
// the dynamically-loaded LastWeekVerdicts client chunk can import it
// without dragging in HomeScene's full transitive graph.
export type VerdictCard = {
  id: string;
  title: string;
  verdict: string;
  finalScore: number;
  href: string;
};
