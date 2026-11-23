-- ============================================================================
-- Home page photo strip ("clothesline" gallery) (site v63), 2026-11-15
--
-- Photos hang in one row between the header and the hero's eyebrow text. Image files
-- live on the web host in /gallery/ (uploaded through /api/gallery_upload.php, which
-- resizes, watermarks and saves them); this table holds the order, hover text, links
-- and show/hide dates. Staff manage it at /staff/gallery.html.
--
--   home_gallery   table: the public reads photos that are showing now; staff read all;
--                  admins add, change and delete (RLS)
--
-- Run in the Supabase SQL Editor AFTER 20261122. Safe to re-run.
-- ============================================================================

create table if not exists public.home_gallery (
    id uuid primary key default gen_random_uuid(),
    image_url text not null,
    thumb_url text not null,
    hover_text text not null default 'Send us your images!',
    highlight boolean not null default false,
    link_url text,
    link_label text,
    sort_order int not null default 0,
    active boolean not null default true,
    starts_at timestamptz,
    ends_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid default auth.uid(),
    -- Images must be files in a /gallery/ folder on the site (or its staging copy)
    constraint home_gallery_image check (image_url ~ '^https://(www\.|staging\.)?welcomegeorgina\.ca/gallery/[A-Za-z0-9._-]+\.jpg$'),
    constraint home_gallery_thumb check (thumb_url ~ '^https://(www\.|staging\.)?welcomegeorgina\.ca/gallery/thumbs/[A-Za-z0-9._-]+\.jpg$'),
    constraint home_gallery_text_len check (char_length(btrim(hover_text)) between 1 and 140),
    -- Links: a page on this site ("/events/...") or a normal web address
    constraint home_gallery_link check (link_url is null or link_url ~ '^/[A-Za-z0-9/_.?=&%-]*$'
        or (link_url ~* '^https?://[^/@\s]+' and link_url !~* '^https?://[^/]*@' and link_url !~ '\s' and char_length(link_url) <= 500)),
    constraint home_gallery_label_len check (link_label is null or char_length(link_label) <= 120),
    constraint home_gallery_window check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index if not exists home_gallery_order_idx on public.home_gallery (sort_order, created_at);

create or replace function public.wg_home_gallery_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists home_gallery_touch on public.home_gallery;
create trigger home_gallery_touch before update on public.home_gallery
    for each row execute function public.wg_home_gallery_touch();

alter table public.home_gallery enable row level security;
grant select on public.home_gallery to anon;
grant select, insert, update, delete on public.home_gallery to authenticated;

-- Everyone (visitors included) sees photos that are on and inside their dates
drop policy if exists home_gallery_public_read on public.home_gallery;
create policy home_gallery_public_read on public.home_gallery
    for select to anon, authenticated
    using (active and (starts_at is null or now() >= starts_at) and (ends_at is null or now() < ends_at));

-- Staff also see hidden and scheduled photos
drop policy if exists home_gallery_staff_read on public.home_gallery;
create policy home_gallery_staff_read on public.home_gallery
    for select to authenticated using (public.wg_is_trusted_caller());

drop policy if exists home_gallery_admin_insert on public.home_gallery;
create policy home_gallery_admin_insert on public.home_gallery
    for insert to authenticated with check (public.is_admin());

drop policy if exists home_gallery_admin_update on public.home_gallery;
create policy home_gallery_admin_update on public.home_gallery
    for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists home_gallery_admin_delete on public.home_gallery;
create policy home_gallery_admin_delete on public.home_gallery
    for delete to authenticated using (public.is_admin());
