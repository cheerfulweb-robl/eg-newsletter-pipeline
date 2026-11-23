-- 20261226_pressroom_admin_and_image_schema.sql
-- Adds image_caption, image_alt, and summary columns to press_articles,
-- sets up admin RLS policies on press_articles, and creates the public
-- press-images storage bucket for Pressroom hero images.
-- Safe to re-run.

begin;

alter table public.press_articles
  add column if not exists summary text,
  add column if not exists image_alt text,
  add column if not exists image_caption text;

alter table public.press_articles enable row level security;

drop policy if exists "Public can read published press articles" on public.press_articles;
create policy "Public can read published press articles"
  on public.press_articles
  for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "Admins can manage all press articles" on public.press_articles;
create policy "Admins can manage all press articles"
  on public.press_articles
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin', 'staff')
    )
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cheerfulweb@gmail.com'
  )
  with check (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'super_admin', 'staff')
    )
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cheerfulweb@gmail.com'
  );

-- Storage bucket for Pressroom single hero images
insert into storage.buckets (id, name, public)
values ('press-images', 'press-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read press-images" on storage.objects;
create policy "Public read press-images"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'press-images');

drop policy if exists "Admins upload press-images" on storage.objects;
create policy "Admins upload press-images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'press-images'
    and (
      exists (
        select 1 from public.user_profiles p
        where p.id = auth.uid()
          and lower(coalesce(p.role, '')) in ('admin', 'super_admin', 'staff')
      )
      or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cheerfulweb@gmail.com'
    )
  );

drop policy if exists "Admins delete press-images" on storage.objects;
create policy "Admins delete press-images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'press-images'
    and (
      exists (
        select 1 from public.user_profiles p
        where p.id = auth.uid()
          and lower(coalesce(p.role, '')) in ('admin', 'super_admin', 'staff')
      )
      or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cheerfulweb@gmail.com'
    )
  );

commit;
