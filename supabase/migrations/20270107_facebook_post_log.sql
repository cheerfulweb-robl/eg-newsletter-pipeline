-- 20270107_facebook_post_log.sql
-- Tracks automated Facebook Page posts so events/articles aren't repeated and
-- evergreen businesses/perks respect a cooldown window.
-- Safe to re-run.
begin;

create table if not exists public.facebook_post_log (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id text not null,
  slot text not null check (slot in ('morning', 'midday', 'afternoon', 'manual')),
  fb_post_id text,
  target_url text not null,
  caption text,
  posted_at timestamptz not null default now()
);

alter table public.facebook_post_log enable row level security;
revoke all on public.facebook_post_log from anon;
revoke insert, update, delete on public.facebook_post_log from authenticated;

drop policy if exists "facebook_post_log_admin_read" on public.facebook_post_log;
create policy "facebook_post_log_admin_read"
  on public.facebook_post_log
  for select
  to authenticated
  using (public.is_admin());

create index if not exists idx_facebook_post_log_source
  on public.facebook_post_log (source_table, source_id, posted_at desc);

create index if not exists idx_facebook_post_log_posted_at
  on public.facebook_post_log (posted_at desc);

commit;
