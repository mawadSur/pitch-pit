// READ-ONLY. Lists the most recent ideas rows (any status) so we can
// scan for ones that don't match a keyword search. Used when looking
// for a build candidate whose pitch title doesn't echo its product
// name.
//
// Usage:
//   node scripts/list-recent-ideas.mjs [limit]   # default 20

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.length >= 2 && v[0] === v.at(-1) && (v[0] === '"' || v[0] === "'")) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = { ...loadEnv(".env"), ...loadEnv(".env.local"), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const limit = Number(process.argv[2] ?? 20);

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase
  .from("ideas")
  .select("id, title, status, mvp_url, score, final_score, created_at")
  .order("created_at", { ascending: false })
  .limit(limit);

if (error) {
  console.error(`query failed: ${error.message}`);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.log("No ideas in the table.");
  process.exit(0);
}

console.log(`${data.length} most-recent ideas:\n`);
for (const row of data) {
  const titleClipped = row.title.length > 50
    ? row.title.slice(0, 47) + "..."
    : row.title;
  console.log(
    `  ${row.created_at.slice(0, 10)}  ${row.status.padEnd(10)} ${String(row.final_score ?? "-").padStart(3)}  ${titleClipped}`,
  );
  console.log(`            id: ${row.id}${row.mvp_url ? `  mvp: ${row.mvp_url}` : ""}`);
}
