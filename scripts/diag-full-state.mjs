// READ-ONLY full-state diagnostic: cron heartbeats, all ideas per week,
// build_queue. Used to understand why the weekly close looks stuck and
// which past winners were never built.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.length >= 2 && v[0] === v.at(-1) && (v[0] === '"' || v[0] === "'")) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = { ...loadEnv(".env"), ...loadEnv(".env.local"), ...process.env };
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("now:", new Date().toISOString(), "dow=", new Date().getUTCDay(), "(0=Sun..6=Sat)");

// 1. cron heartbeats
const { data: hb, error: hbErr } = await supabase
  .from("cron_heartbeats")
  .select("*")
  .order("last_run_at", { ascending: false, nullsFirst: false });
console.log("\n=== cron_heartbeats ===");
if (hbErr) console.log("  (error:", hbErr.message, ")");
else for (const h of hb ?? []) {
  console.log(`  ${String(h.job_name ?? h.name).padEnd(26)} last_run=${h.last_run_at ?? "NEVER"} status=${h.last_status ?? h.status ?? "-"} ${h.last_error ? "err=" + h.last_error : ""}`);
}

// 2. weeks + ids
const { data: weeks } = await supabase
  .from("weeks")
  .select("id, week_number, status, start_at, end_at, winner_idea_id")
  .order("week_number", { ascending: true });
const idToWeek = new Map(weeks.map((w) => [w.id, w.week_number]));

// 3. all ideas
const { data: ideas } = await supabase
  .from("ideas")
  .select("id, title, status, week_id, score, final_score, vote_count, mvp_url, created_at")
  .order("created_at", { ascending: true });

console.log("\n=== ideas by week (all statuses) ===");
for (const w of weeks) {
  const mine = ideas.filter((i) => i.week_id === w.id);
  const winnerMark = w.winner_idea_id ? ` winner=${w.winner_idea_id.slice(0, 8)}` : " winner=NONE";
  console.log(`\nweek #${w.week_number} [${w.status}] ${w.start_at.slice(0,10)}→${w.end_at.slice(0,10)}${winnerMark} — ${mine.length} ideas`);
  for (const i of mine) {
    const isWinner = i.id === w.winner_idea_id ? " ◄WINNER" : "";
    console.log(`    ${i.status.padEnd(9)} fs=${String(i.final_score ?? "-").padStart(3)} ai=${String(i.score ?? "-").padStart(2)} v=${String(i.vote_count ?? 0).padStart(2)} ${i.id.slice(0,8)} ${(i.title ?? "").slice(0, 38)}${i.mvp_url ? " mvp✓" : ""}${isWinner}`);
  }
}
const orphans = ideas.filter((i) => !idToWeek.has(i.week_id));
if (orphans.length) {
  console.log(`\n=== orphan ideas (week_id not in weeks) — ${orphans.length} ===`);
  for (const i of orphans) console.log(`    ${i.status.padEnd(9)} ${i.id.slice(0,8)} ${(i.title ?? "").slice(0,38)}`);
}

// 4. build_queue
const { data: bq, error: bqErr } = await supabase
  .from("build_queue")
  .select("idea_id, status, build_phase, mvp_url, approved_at, started_at, completed_at, retry_count")
  .order("approved_at", { ascending: false, nullsFirst: false });
console.log("\n=== build_queue ===");
if (bqErr) console.log("  (error:", bqErr.message, ")");
else for (const b of bq ?? []) {
  const idea = ideas.find((i) => i.id === b.idea_id);
  console.log(`  ${b.status.padEnd(11)} phase=${(b.build_phase ?? "-").padEnd(10)} retry=${b.retry_count ?? 0} ${b.idea_id.slice(0,8)} ${(idea?.title ?? "?").slice(0,30)}${b.mvp_url ? " mvp✓" : ""}`);
}

// 5. week_results snapshots count per week
const { data: wr } = await supabase.from("week_results").select("week_id, rank, idea_id, final_score");
console.log("\n=== week_results snapshot counts ===");
const wrByWeek = {};
for (const r of wr ?? []) {
  const wn = idToWeek.get(r.week_id) ?? "?";
  (wrByWeek[wn] ??= []).push(r);
}
for (const w of weeks) {
  const rows = wrByWeek[w.week_number] ?? [];
  console.log(`  week #${w.week_number}: ${rows.length} snapshot rows`);
}
