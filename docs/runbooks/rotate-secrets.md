# Secret Rotation Runbook

Procedures for rotating each production secret without downtime. Follow
the order listed — most secrets need to be updated in two places before
the old value is invalidated, or you'll trip a 401/500 in flight.

> Conventions: Vercel project = `pitch-pit` (Production env unless
> noted). GitHub repo = the one wired to `cron-*.yml` workflows. Always
> rotate in **Production**, **Preview**, and **Development** scopes
> unless a secret is explicitly server-only and unused in Preview.

---

## 1. `CRON_SECRET`

**Where it lives**
- Vercel → Project Settings → Environment Variables (Production +
  Preview), read by `lib/cron-auth.ts` (`process.env.CRON_SECRET`).
- GitHub → Repo Settings → Secrets and variables → Actions, sent as
  `Authorization: Bearer $CRON_SECRET` by every workflow under
  `.github/workflows/cron-*.yml`.

**Rotation**
1. Generate: `openssl rand -hex 32`.
2. **Vercel first**: add the new value as `CRON_SECRET` (overwrite). Do
   NOT redeploy yet.
3. **GitHub second**: update the `CRON_SECRET` Actions secret to the
   same value.
4. Trigger a Vercel redeploy (Production). The new env baking in is
   what makes the new secret live; until redeploy, the route still
   reads the old value from the previous build.
5. Old secret is dead the moment the new deploy is promoted.

**Verify**
- Re-run any cron workflow manually from the Actions tab (e.g.
  `cron-post-leader.yml` → Run workflow). Expect HTTP 200.
- Alternatively `curl -H "Authorization: Bearer <new>"
  https://pitch-pit.vercel.app/api/cron/post-leader` → 200; with the
  old secret → 401.

**Blast radius**
- Mismatch = every cron route returns 401 → no week-close, no winner
  email, no social posts. Visible in `cron_heartbeats` (silence) and
  GitHub Actions (red runs).

**Cadence**
- Quarterly, or immediately on any GitHub repo permission change.

---

## 2. `ADMIN_PASSWORD`

**Where it lives**
- Vercel → Environment Variables (Production + Preview).
- Read by `middleware.ts` via `lib/admin-auth.ts` to gate `/admin` and
  `/admin/*` with HTTP Basic Auth.

**Rotation**
1. Generate: `openssl rand -base64 24` (URL-safe, paste-friendly).
2. Update `ADMIN_PASSWORD` in Vercel (Production + Preview).
3. Redeploy Production.
4. Distribute the new value through the team's password manager — Basic
   Auth has no token revocation; the only kill switch is the env var.

**Verify**
- `curl -u admin:<new> https://pitch-pit.vercel.app/admin` → 200.
- With old password → 401.
- Browser: clear saved credentials for the domain, hit `/admin`,
  authenticate with new password.

**Blast radius**
- Wrong value = no operator can reach `/admin`. Public site is
  unaffected. To recover, push a new env var and redeploy.

**Cadence**
- Quarterly, and immediately on any operator offboarding.

---

## 3. `SUPABASE_SERVICE_ROLE_KEY`

**Where it lives**
- Vercel → Environment Variables (Production + Preview), server-only.
- Read by `lib/supabase/admin.ts` (used by `app/api/score`,
  `app/(with-footer)/admin/actions.ts`, every `app/api/cron/*` route).
- Issued by Supabase → Project Settings → API → `service_role` key.

**Rotation**
1. Supabase dashboard → Project Settings → API → click **Reset** next
   to `service_role`. This invalidates the old key immediately on
   Supabase's side — there is no overlap window.
2. Copy the new key.
3. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel (Production + Preview).
4. Redeploy Production immediately to minimize the 500-window.

**Verify**
- Submit a test pitch via `/submit`. The `/api/score` call must succeed
  (uses the admin client to insert).
- Check Supabase logs for `JWT expired` / `Invalid API key` after
  redeploy — should be zero.

**Blast radius**
- Window between Supabase reset and Vercel redeploy = `/api/score`
  returns 500, all cron routes that write fail, `/admin` actions fail.
  Public reads still work (anon key is unchanged).

**Cadence**
- Annually, or immediately on suspected compromise (e.g. accidental
  commit, leaked log, ex-contractor).

---

## 4. `ANTHROPIC_API_KEY`

**Where it lives**
- Vercel → Environment Variables (Production + Preview), server-only.
- Read by `app/api/score/route.ts` (and `app/api/pitch-coach`).
- Issued by Anthropic Console → Settings → API Keys.

**Rotation**
1. Anthropic Console → API Keys → **Create Key**. Name it with the
   rotation date.
2. Add the new key to Vercel as `ANTHROPIC_API_KEY` (overwrite).
3. Redeploy Production.
4. Anthropic Console → revoke the old key.

**Verify**
- Submit a pitch through `/submit` — score must come back within ~10s.
- Anthropic Console → Usage panel shows requests under the new key.

**Blast radius**
- Wrong key = `/api/score` and `/api/pitch-coach` return 500. Users
  see "could not score your pitch." No data loss; users can resubmit
  after fix.

**Cadence**
- Annually, or immediately if the key appears in any log/screenshot.

---

## 5. X (Twitter) API credentials

`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`

**Where it lives**
- Vercel → Environment Variables (Production), server-only.
- Read by `lib/social/x.ts` for OAuth 1.0a request signing on the
  `cron-post-leader` and `cron-post-winner` routes.
- Issued by X Developer Portal → Projects & Apps → your app.

**Rotation**
1. X Developer Portal → your app → **Keys and tokens** tab.
2. To rotate the API key pair: click **Regenerate** under "API Key and
   Secret". Old pair dies immediately.
3. To rotate the access token pair: click **Regenerate** under "Access
   Token and Secret". Make sure the app's **User authentication
   settings** still grant Read+Write — regenerating sometimes downgrades
   to Read.
4. Update all four values in Vercel (Production). Update all four in
   one save to keep the OAuth signature consistent.
5. Redeploy Production.

**Verify**
- Trigger `cron-post-leader.yml` manually from GitHub Actions.
- Check `social_post_log` row for `success=true` and a valid
  `tweet_id`.
- Check the X account directly for the post.

**Blast radius**
- Mismatched pair = OAuth signature fails → 401 from X → social posts
  silently skipped. Logged to `social_post_log` and Sentry. No user
  impact, but the weekly leader/winner promotion goes dark until
  fixed.

**Cadence**
- Annually for keys, or immediately on app permission change.

---

## After any rotation

- Tail Vercel logs for ~10 minutes for the affected route.
- Check Sentry for new spikes.
- Note the rotation date + secret name in the team password manager
  audit log.
