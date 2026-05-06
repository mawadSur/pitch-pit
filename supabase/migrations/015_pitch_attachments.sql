-- pitch-pit · 015 · image attachments on pitches
--
-- Adds image_urls columns + a public storage bucket so users can attach
-- up to 3 images to their pitch. Voice input is purely client-side
-- (Web Speech API → appended text), so no schema work needed there.
--
-- Idempotent: column adds use IF NOT EXISTS, the bucket insert is
-- ON CONFLICT DO NOTHING, and the policies use DROP IF EXISTS first.

alter table public.draft_pitches
  add column if not exists image_urls text[] not null default '{}'::text[];

alter table public.ideas
  add column if not exists image_urls text[] not null default '{}'::text[];

comment on column public.draft_pitches.image_urls is
  'Up to 3 public Supabase Storage URLs of images attached to the pitch.';
comment on column public.ideas.image_urls is
  'Up to 3 public Supabase Storage URLs of images attached to the pitch (carried over from the resolved draft).';

-- ─── storage bucket ──────────────────────────────────────────────────
-- Public bucket so the judges can render images via the public URL
-- without signed URLs. 5MB per file is enforced at the bucket level;
-- the per-pitch 3-image cap is enforced at the API and UI layer.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pitch-images',
  'pitch-images',
  true,
  5 * 1024 * 1024, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ─── RLS policies on storage.objects (scoped to this bucket) ─────────
-- Authenticated users can upload to a path that starts with their own
-- user id (e.g. `users/<uuid>/<filename>`). Public read for anyone.
-- Owners can delete their own. No update path — uploads are immutable.

drop policy if exists "pitch-images public read"
  on storage.objects;
create policy "pitch-images public read"
  on storage.objects
  for select
  using (bucket_id = 'pitch-images');

drop policy if exists "pitch-images authenticated upload to own path"
  on storage.objects;
create policy "pitch-images authenticated upload to own path"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'pitch-images'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "pitch-images owner delete"
  on storage.objects;
create policy "pitch-images owner delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'pitch-images'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
