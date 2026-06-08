// READ-ONLY: list `ideas` rows whose title/pitch/handle matches a search
// term. Used to figure out which existing idea corresponds to a built
// MVP url before flipping it with the mark-built admin action.
//
// Usage:
//   node scripts/find-build-candidates.mjs ailevel
//   node scripts/find-build-candidates.mjs lotpilot
//
// Reads env from .env.local / .env (same pattern as bootstrap-admin.mjs).

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
const term = process.argv[2];

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!term) {
  console.error("Usage: node scripts/find-build-candidates.mjs <search-term>");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const pattern = `%${term}%`;
const { data, error } = await supabase
  .from("ideas")
  .select(
    "id, title, handle, status, mvp_url, score, final_score, created_at, week_id",
  )
  .or(`title.ilike.${pattern},pitch.ilike.${pattern},handle.ilike.${pattern}`)
  .order("created_at", { ascending: false })
  .limit(20);

if (error) {
  console.error(`query failed: ${error.message}`);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.log(`No ideas matched "${term}".`);
  process.exit(0);
}

console.log(`Found ${data.length} candidate(s) for "${term}":\n`);
for (const row of data) {
  console.log(`  id          ${row.id}`);
  console.log(`  title       ${row.title}`);
  console.log(`  handle      ${row.handle ?? "(null)"}`);
  console.log(`  status      ${row.status}`);
  console.log(`  mvp_url     ${row.mvp_url ?? "(null)"}`);
  console.log(`  score/final ${row.score ?? "-"} / ${row.final_score ?? "-"}`);
  console.log(`  created_at  ${row.created_at}`);
  console.log("");
}
