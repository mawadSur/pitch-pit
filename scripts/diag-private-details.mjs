// One-off verification for T4 (migration 035). Proves the privacy invariant:
//   1. draft_pitches.private_details exists and accepts a value (insert+read)
//   2. ideas has NO private_details column (the secret can never land there)
//   3. cleans up the probe row
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

const token = "smoketest-" + Math.abs(Date.now() % 1e9);
let pass = true;

// 1. Insert a draft with private_details
const secret = "PROBE-SECRET-feed-judges-only";
const { data: ins, error: insErr } = await supabase
  .from("draft_pitches")
  .insert({
    access_token: token,
    title: "Private field probe",
    pitch: "This row exists only to verify migration 035 accepts a private_details value. It is deleted at the end of this script.",
    private_details: secret,
  })
  .select("id, private_details")
  .single();

if (insErr) { console.error("FAIL insert:", insErr.message); pass = false; }
else if (ins.private_details !== secret) { console.error("FAIL: stored value mismatch"); pass = false; }
else console.log("OK  draft_pitches accepts + stores private_details");

// 2. Confirm ideas has no private_details column. PostgREST errors with
//    42703 / "column ideas.private_details does not exist" when selected.
const { error: ideasErr } = await supabase.from("ideas").select("private_details").limit(1);
if (!ideasErr) {
  console.error("FAIL: ideas.private_details IS selectable — the secret could leak!");
  pass = false;
} else if (/private_details/.test(ideasErr.message) || ideasErr.code === "42703") {
  console.log("OK  ideas has NO private_details column (secret can't land there)");
} else {
  console.error("?? unexpected ideas error:", ideasErr.message);
  pass = false;
}

// 3. Cleanup the probe row
if (ins?.id) {
  const { error: delErr } = await supabase.from("draft_pitches").delete().eq("id", ins.id);
  console.log(delErr ? `WARN cleanup failed: ${delErr.message}` : "OK  probe row cleaned up");
}

console.log(pass ? "\n✅ T4 invariant holds" : "\n❌ T4 invariant FAILED");
process.exit(pass ? 0 : 1);
