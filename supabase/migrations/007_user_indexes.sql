-- pitch-pit · 007 · user-scoped query indexes
--
-- The /submissions page filters ideas by `user_id`, but the column was never
-- indexed (only votes.user_id was). At ~1k+ ideas the sequential scan starts
-- showing up in slow-query logs.

create index if not exists ideas_user_id_idx
  on public.ideas (user_id)
  where user_id is not null;
