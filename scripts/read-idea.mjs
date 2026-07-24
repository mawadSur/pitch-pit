// READ-ONLY. Print one idea row with its full pitch text.
//
// Usage: node scripts/read-idea.mjs <idea_id>

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
const id = process.argv[2];

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!id) {
  console.error("Usage: node scripts/read-idea.mjs <idea_id>");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase
  .from("ideas")
  .select("*")
  .eq("id", id)
  .maybeSingle();

if (error) {
  console.error(`query failed: ${error.message}`);
  process.exit(1);
}
if (!data) {
  console.log(`No idea with id ${id}.`);
  process.exit(0);
}

console.log(`id          ${data.id}`);
console.log(`title       ${data.title}`);
console.log(`handle      ${data.handle ?? "(null)"}`);
console.log(`status      ${data.status}`);
console.log(`mvp_url     ${data.mvp_url ?? "(null)"}`);
console.log(`score/final ${data.score ?? "-"} / ${data.final_score ?? "-"}`);
console.log(`created_at  ${data.created_at}`);
console.log(`\npitch:\n${data.pitch}`);
