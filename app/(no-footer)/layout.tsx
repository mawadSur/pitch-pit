// Route group for full-bleed routes that suppress the manifesto footer.
// Currently: `/` (cinematic homepage with its own bottom-anchored counter
// + scroll cue) and `/idea/[id]` (the verdict reveal with its own
// score + ShareMenu cluster anchored to the bottom). Both surfaces own
// their own page-ending chrome — adding the manifesto footer underneath
// would visually compete with it.
//
// Adding a route here is opt-in by directory placement; no pathname
// strings to keep in sync. The sibling (with-footer)/layout.tsx renders
// the footer for every other route.
export default function NoFooterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
