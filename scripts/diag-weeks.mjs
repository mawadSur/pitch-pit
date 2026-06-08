// READ-ONLY diagnostic. Dumps the weeks table + current open week's ideas
// so we can see whether the weekly rollover actually fired.
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

console.log("now (server clock):", new Date().toISOString(), "UTC dow=", new Date().getUTCDay());

const { data: weeks, error: we } = await supabase
  .from("weeks")
  .select("week_number, status, start_at, end_at, winner_idea_id")
  .order("week_number", { ascending: false });
if (we) { console.error("weeks query failed:", we.message); process.exit(1); }

console.log("\n=== weeks ===");
for (const w of weeks) {
  console.log(
    `  #${String(w.week_number).padStart(2)} ${w.status.padEnd(7)} ${w.start_at} -> ${w.end_at}  winner=${w.winner_idea_id ?? "-"}`,
  );
}

const open = weeks.find((w) => w.status === "open");
console.log("\nopen week:", open ? `#${open.week_number}` : "NONE");

// Count ideas per week_id (need ids → fetch fresh)
const { data: weekIds } = await supabase.from("weeks").select("id, week_number");
const idMap = new Map(weekIds.map((w) => [w.id, w.week_number]));

const { data: ideas } = await supabase
  .from("ideas")
  .select("id, title, status, week_id, final_score, created_at")
  .order("created_at", { ascending: false })
  .limit(50);

const byWeek = {};
for (const i of ideas) {
  const wn = idMap.get(i.week_id) ?? "null";
  byWeek[wn] = (byWeek[wn] ?? 0) + 1;
}
console.log("\n=== recent-50 ideas grouped by week_number ===");
for (const [wn, n] of Object.entries(byWeek)) console.log(`  week ${wn}: ${n} ideas`);

console.log("\n=== newest 8 ideas ===");
for (const i of ideas.slice(0, 8)) {
  console.log(`  ${i.created_at.slice(0, 10)} wk=${idMap.get(i.week_id) ?? "null"} ${i.status.padEnd(9)} fs=${i.final_score ?? "-"}  ${i.title.slice(0, 40)}`);
}
