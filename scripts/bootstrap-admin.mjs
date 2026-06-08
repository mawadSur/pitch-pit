// One-shot helper to mark a user as admin in public.users.is_admin.
// Reads supabase URL + service-role key from process.env (local .env).
// Looks up the user by email in auth.users, sets is_admin = true on
// the matching public.users row, then verifies.
//
// Usage:
//   node scripts/bootstrap-admin.mjs you@example.com
//
// This exists because public.users RLS blocks client-side promotion
// (with check ... and is_admin = false), so the only paths to grant
// admin are the Supabase SQL editor or a service-role connection.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

// Lightweight .env reader — avoids pulling in dotenv as a dep.
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
const email = process.argv[2];

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!email) {
  console.error("Usage: node scripts/bootstrap-admin.mjs <email>");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Page through auth.users (admin API max 1000/page). Small project here
// so one page is enough, but handle pagination defensively anyway.
let user = null;
let page = 1;
while (!user) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage: 1000,
  });
  if (error) {
    console.error(`auth.admin.listUsers failed: ${error.message}`);
    process.exit(1);
  }
  user = data.users.find((u) => u.email === email);
  if (user) break;
  if (data.users.length < 1000) break;
  page++;
}

if (!user) {
  console.error(`No auth user with email ${email}.`);
  process.exit(1);
}
console.log(`Matched auth user: ${user.id} (${user.email})`);

const { error: updErr } = await supabase
  .from("users")
  .update({ is_admin: true })
  .eq("id", user.id);
if (updErr) {
  console.error(`update public.users failed: ${updErr.message}`);
  process.exit(1);
}

const { data: row, error: readErr } = await supabase
  .from("users")
  .select("id, is_admin")
  .eq("id", user.id)
  .maybeSingle();
if (readErr) {
  console.error(`verify read failed: ${readErr.message}`);
  process.exit(1);
}

if (row?.is_admin === true) {
  console.log(`✓ ${email} is now admin.`);
} else {
  console.error(`✗ verification failed — row: ${JSON.stringify(row)}`);
  process.exit(1);
}
