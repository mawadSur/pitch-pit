// One-shot: set up the prod build_queue row + token for a given idea,
// flip it to status='building', and print the repository_dispatch payload
// to fire (via `gh api`). Mirrors what /api/cron/close-week-and-build does,
// but driven manually for a back-catalog winner that the cron skipped.
//
// Usage:
//   node scripts/fire-build.mjs <idea_id> [--commit]
//
// Without --commit it is a DRY RUN: prints the idea + the exact payload and
// gh command, writes nothing. With --commit it mints the token, upserts the
// build_queue row, flips the idea to building, and writes payload.json so
// the caller can fire the dispatch.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

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

// Canonical prod origin — NOT the hyphenated NEXT_PUBLIC_SITE_URL that the
// local .env happens to carry (CLAUDE.md: use pitchpit.app, never pitch-pit.app).
const PROD_ORIGIN = "https://pitchpit.app";

function titleToSlug(title) {
  return (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const env = { ...loadEnv(".env"), ...loadEnv(".env.local"), ...process.env };
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ideaId = process.argv[2];
const commit = process.argv.includes("--commit");
if (!ideaId) { console.error("Usage: node scripts/fire-build.mjs <idea_id> [--commit]"); process.exit(1); }

const { data: idea, error } = await supabase
  .from("ideas")
  .select("id, title, pitch, score, final_score, verdict, strengths, concerns, reasoning, status, mvp_url")
  .eq("id", ideaId)
  .maybeSingle();
if (error) { console.error("fetch failed:", error.message); process.exit(1); }
if (!idea) { console.error("no idea with id", ideaId); process.exit(1); }

console.log("idea:", idea.title, "| status:", idea.status, "| fs:", idea.final_score, "| mvp_url:", idea.mvp_url ?? "(none)");

if (idea.status === "building" || idea.status === "built") {
  console.error(`\nREFUSING: idea is already '${idea.status}'. Nothing to do.`);
  process.exit(1);
}

const slug = titleToSlug(idea.title);
const subdomain = slug ? `mvp-${slug}` : `mvp-${idea.id.slice(0, 8)}`;
const callbackToken = Array.from(randomBytes(16), (b) => b.toString(16).padStart(2, "0")).join("");
const callbackUrl = `${PROD_ORIGIN}/api/build-callback`;

const dispatchPayload = {
  event_type: "pitch-pit-build",
  client_payload: {
    idea: {
      id: idea.id, title: idea.title, pitch: idea.pitch, score: idea.score,
      final_score: idea.final_score, verdict: idea.verdict,
      strengths: idea.strengths, concerns: idea.concerns, reasoning: idea.reasoning,
    },
    slug, subdomain, callback_url: callbackUrl, callback_token: callbackToken, attempt: 1,
  },
};

console.log("\nslug:        ", slug);
console.log("subdomain:   ", subdomain, "→ https://" + subdomain + ".pitchpit.app");
console.log("callback_url:", callbackUrl);
console.log("token:       ", commit ? callbackToken : "(dry-run — not minted)");

if (!commit) {
  console.log("\n--- DRY RUN. Re-run with --commit to set up build_queue + flip status. ---");
  console.log("\npayload preview:\n" + JSON.stringify(dispatchPayload, null, 2));
  process.exit(0);
}

const now = new Date().toISOString();

// 1. build_queue row with the token (mirrors cron step 6)
const { error: qErr } = await supabase.from("build_queue").upsert({
  idea_id: idea.id, status: "in_progress", approved_at: now, started_at: now,
  callback_token: callbackToken, retry_count: 0, build_phase: "queued", build_logs: [],
}, { onConflict: "idea_id" });
if (qErr) { console.error("build_queue upsert failed:", qErr.message); process.exit(1); }

// 2. flip idea to building (mirrors cron step 5)
const { error: iErr } = await supabase.from("ideas").update({ status: "building" }).eq("id", idea.id);
if (iErr) { console.error("idea status update failed:", iErr.message); process.exit(1); }

// 3. write payload.json for the gh dispatch
writeFileSync("scripts/.build-payload.json", JSON.stringify(dispatchPayload.client_payload, null, 2));
console.log("\n✅ build_queue row set up, idea flipped to 'building'.");
console.log("✅ payload written to scripts/.build-payload.json");
console.log("\nNow fire the dispatch:");
console.log(`  gh api repos/mawadSur/pitch-pit-builder/dispatches -X POST -f event_type=pitch-pit-build --input <(jq '{event_type:"pitch-pit-build",client_payload:.}' scripts/.build-payload.json)`);
