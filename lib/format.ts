// P-6: vote-count formatter. Past 1,000 votes the bare number ("1234") is
// hard to skim — render with thousands separators ("1,234"). The Intl
// formatter is cheap and returns identical bytes server vs client (en-US
// is locale-stable), so it's safe to use in SSR-rendered components.
const VOTE_FORMATTER = new Intl.NumberFormat("en-US");
export function formatVoteCount(count: number | null | undefined): string {
  return VOTE_FORMATTER.format(count ?? 0);
}

export function timeAgo(iso: string, nowMs = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, nowMs - then);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(mo / 12);
  return `${y}y ago`;
}

export function truncate(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

const ROMAN: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

export function roman(n: number): string {
  if (n <= 0) return "";
  let s = "";
  let x = n;
  for (const [v, c] of ROMAN) {
    while (x >= v) {
      s += c;
      x -= v;
    }
  }
  return s;
}

export type ScoreTier = "fallen" | "bronze" | "silver" | "gold";

export function tierFor(score: number | null | undefined): ScoreTier {
  if (score == null) return "fallen";
  if (score <= 3) return "fallen";
  if (score <= 6) return "bronze";
  if (score <= 8) return "silver";
  return "gold";
}
