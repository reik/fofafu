-- eng-infra-7: uploads move from local-disk (backend/uploads, served by
-- Express's unauthenticated `express.static`) to a Supabase Storage bucket.
--
-- The old Express endpoint served every uploaded file publicly with no ACL
-- check on read (only the POST was behind `authenticate`). `mediaUrl` /
-- `avatarUrl` columns already store a plain, permanent URL string that
-- outlives the request — a private bucket + expiring signed URLs would
-- eventually 403 on old posts without a migration to store storage paths
-- instead of URLs, and there is no confidentiality requirement being
-- relaxed (the files were already public). A public bucket is therefore the
-- faithful equivalent of the Express behavior, not a downgrade.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Writers must be authenticated and can only write into their own
-- `<uid>/...` prefix (mirrors the app-level `authenticate` gate the old
-- POST /api/uploads had; Storage has no filename-collision risk since
-- object names are randomUUID()-based, same as the old multer filename fn).
create policy "uploads are insertable by their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public bucket already serves reads via the public endpoint without RLS,
-- but an explicit SELECT policy keeps `list`/`getPublicUrl` metadata calls
-- consistent for authenticated callers too.
create policy "uploads are publicly readable"
  on storage.objects for select
  using (bucket_id = 'uploads');
