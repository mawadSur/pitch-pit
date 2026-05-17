# Backup restore drill

## Why

A backup that has never been restored is hope, not protection. Supabase
takes daily backups automatically, but until we have proven we can
restore one, we don't actually have a backup — we have a database snapshot
of unknown integrity. This drill exists to convert that hope into evidence.

Run it on a cadence (see below). Record results. Treat a failed drill as
a P0 incident.

## Verify backups exist (pre-drill, ~2 min)

1. Open the Supabase dashboard → select the `pitch-pit` prod project.
2. Navigate: **Project → Database → Backups**.
3. Confirm:
   - Daily backups are listed for at least the last 7 days.
   - The most recent backup is < 36 h old.
   - **Retention**: 7 days on the Free plan, 14 days on Pro, 28 days on
     Team. If we are on Free and want longer, upgrade before the drill.
4. If anything is missing, stop and escalate — fix backup health before
   running the drill.

## Drill procedure (~30–45 min)

### 1. Provision the restore target

- Use a dedicated project named `pitch-pit-restore-test` (preferred —
  reusable, predictable URL). If it doesn't exist, create a fresh
  Supabase project in the same region as prod.
- Capture the temp project's `DB_HOST`, `DB_PORT`, `DB_USER`,
  `DB_PASSWORD` from **Project Settings → Database → Connection string**.

### 2. Download the backup

- In prod's **Backups** tab, click the most recent daily backup → **Download**.
- Save as `~/Downloads/pitch-pit-backup-YYYY-MM-DD.sql.gz`.
- Verify the file is non-empty and gunzips cleanly:
  `gunzip -t pitch-pit-backup-YYYY-MM-DD.sql.gz`.

### 3. Apply the dump to the temp project

```bash
# If the temp project has prior state, reset it first.
supabase link --project-ref <temp-project-ref>
supabase db reset --linked   # WARNING: destroys temp project data

# Apply the dump. Use the pooled connection string for parallel COPY.
gunzip -c pitch-pit-backup-YYYY-MM-DD.sql.gz \
  | psql "postgresql://postgres:<password>@<host>:5432/postgres"
```

If `psql` reports errors, capture them — partial restores are a real
finding worth recording.

### 4. Row-count verification

Run this against both prod and the restore target. Counts should match
within the delta of writes since the backup was taken (typically near-zero
for a Sunday-morning drill).

```sql
select 'users'        as t, count(*) from public.users
union all select 'ideas',       count(*) from public.ideas
union all select 'votes',       count(*) from public.votes
union all select 'weeks',       count(*) from public.weeks
union all select 'build_queue', count(*) from public.build_queue;
```

### 5. Spot-check 3 records

Pick 3 known-good rows in prod and confirm they restored byte-identically.
Suggested set:
- The LotPilot AI winner row in `ideas` (look up the id from `/built`).
- The most recent closed `weeks` row (`status = 'closed'`).
- A `votes` row from a known account (look up via `/admin`).

```sql
-- Example: confirm LotPilot AI restored.
select id, title, slug, score, final_score, status
from public.ideas
where slug = 'lotpilot-ai';
```

Compare to prod via dashboard or `psql` against prod's read-only role.
Pay attention to `final_score` — it's trigger-computed, so a mismatch
could indicate the trigger didn't replay (which is fine; backups are
data, not triggers re-firing) or a real corruption.

## What to record

Append a row to `docs/runbooks/backup-restore-drill-log.md` (create if
missing) with:

- Drill date (UTC)
- Operator
- Backup date used
- Restore time elapsed (download + psql apply)
- Migration HEAD the prod backup was taken at (`git log -1 --format=%H supabase/migrations/`)
- Row-count diff vs prod (per table)
- Spot-check pass/fail
- Issues encountered
- Cleanup confirmed (Y/N)

## Cadence

- **Quarterly minimum** — first Sunday of Jan / Apr / Jul / Oct.
- **Monthly** during high-velocity periods (post-launch, schema migrations
  > 3 in a month, after any incident touching prod data).
- **Ad-hoc** after any change that could affect restorability: Supabase
  plan change, region change, major migration, RLS policy overhaul.

## Post-drill cleanup

- Delete the downloaded backup file from local disk.
- If you created a one-off temp project (not the reusable
  `pitch-pit-restore-test`), **delete it** in **Project Settings → General → Delete project**.
  Supabase bills paused projects after 7 days — leftover restore targets
  are silent budget creep.
- If using the persistent `pitch-pit-restore-test`, leave it but
  `supabase db reset --linked` so it sits empty until next drill.
