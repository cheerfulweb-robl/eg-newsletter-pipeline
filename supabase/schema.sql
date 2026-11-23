-- ============================================================================
-- WELCOME GEORGINA (welcomeeg.ca & news.welcomeeg.ca)
-- Unified Supabase Schema for Project: cyxomkhydsmttefanalx
--
-- Integrates with existing Welcome East Gwillimbury tables:
--   - public.partners (Business Offers & Sponsors)
--   - public.claims (Newcomer & New Business Hamper Claims)
--   - public.user_profiles (Admin & Salesperson Staff Accounts)
--   - public.activity_logs (Sales CRM Activity)
--   - public.is_admin() & public.is_staff() (Existing RLS Helper Functions)
--
-- Adds tables for news.welcomeeg.ca & the Dual Newsletter Pipeline:
--   1. public.vendor_profiles (Small Vendor Member Accounts)
--   2. public.vendor_events (Vendor Event & News Submissions -> Admin Approval)
--   3. public.vendor_scrape_sources (Vendor Auto-Scrape Website URLs -> Admin Approval)
--   4. public.newsletter_subscribers (Reader & Vendor Newsletter Subscriptions + Unsubscribes)
--   5. public.link_clicks & public.advertiser_click_summary (Advertiser Clickthrough Analytics)
-- ============================================================================

create extension if not exists "pgcrypto";

-- Ensure public.is_admin() exists (uses existing user_profiles table on cyxomkhydsmttefanalx)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
    select exists (
        select 1
        from public.user_profiles
        where id = auth.uid()
          and role = 'admin'
          and active = true
    );
$$;

-- ----------------------------------------------------------------------------
-- 1. SMALL VENDOR MEMBER PROFILES
-- ----------------------------------------------------------------------------
create table if not exists public.vendor_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    business_name text not null,
    contact_name text default '',
    town_area text default 'East Gwillimbury',
    website_url text default '',
    is_admin boolean not null default false,
    created_at timestamptz not null default now()
);

alter table public.vendor_profiles enable row level security;

drop policy if exists "Users can view own vendor profile or admins view all" on public.vendor_profiles;
create policy "Users can view own vendor profile or admins view all"
    on public.vendor_profiles for select
    using (auth.uid() = id or public.is_admin() or public.is_staff());

drop policy if exists "Users can insert own vendor profile" on public.vendor_profiles;
create policy "Users can insert own vendor profile"
    on public.vendor_profiles for insert
    with check (auth.uid() = id or public.is_admin());

drop policy if exists "Users can update own vendor profile or admins update all" on public.vendor_profiles;
create policy "Users can update own vendor profile or admins update all"
    on public.vendor_profiles for update
    using (auth.uid() = id or public.is_admin());


-- ----------------------------------------------------------------------------
-- 2. MANUAL VENDOR EVENT & NEWS SUBMISSIONS
-- ----------------------------------------------------------------------------
create table if not exists public.vendor_events (
    id uuid primary key default gen_random_uuid(),
    vendor_id uuid references auth.users(id) on delete set null,
    business_name text not null,
    submitter_email text not null,
    title text not null,
    event_date_label text not null,
    event_start_date date,
    expires_after date,
    location text not null default 'East Gwillimbury, ON',
    link text not null default 'https://welcomeeg.ca',
    summary text not null,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    created_at timestamptz not null default now()
);

create index if not exists idx_vendor_events_status on public.vendor_events(status);
alter table public.vendor_events enable row level security;

drop policy if exists "Read approved events or own events or staff" on public.vendor_events;
create policy "Read approved events or own events or staff"
    on public.vendor_events for select
    using (
        status = 'approved'
        or auth.uid() = vendor_id
        or public.is_admin()
        or public.is_staff()
    );

drop policy if exists "Authenticated vendors can submit events" on public.vendor_events;
create policy "Authenticated vendors can submit events"
    on public.vendor_events for insert
    with check (
        auth.role() = 'authenticated'
        and (status = 'pending' or public.is_admin())
    );

drop policy if exists "Admins can update any event" on public.vendor_events;
create policy "Admins can update any event"
    on public.vendor_events for update
    using (public.is_admin() or public.is_staff() or (auth.uid() = vendor_id and status = 'pending'));

drop policy if exists "Admins or owner can delete event" on public.vendor_events;
create policy "Admins or owner can delete event"
    on public.vendor_events for delete
    using (public.is_admin() or auth.uid() = vendor_id);


-- ----------------------------------------------------------------------------
-- 3. VENDOR AUTO-SCRAPE WEBSITE URLS
-- ----------------------------------------------------------------------------
create table if not exists public.vendor_scrape_sources (
    id uuid primary key default gen_random_uuid(),
    vendor_id uuid references auth.users(id) on delete set null,
    business_name text not null,
    submitter_email text not null,
    scrape_url text not null,
    default_location text not null default 'East Gwillimbury, ON',
    notes text default '',
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    last_scraped_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_vendor_scrape_status on public.vendor_scrape_sources(status);
alter table public.vendor_scrape_sources enable row level security;

drop policy if exists "Read approved scrape URLs or own or staff" on public.vendor_scrape_sources;
create policy "Read approved scrape URLs or own or staff"
    on public.vendor_scrape_sources for select
    using (
        status = 'approved'
        or auth.uid() = vendor_id
        or public.is_admin()
        or public.is_staff()
    );

drop policy if exists "Authenticated vendors can submit scrape URLs" on public.vendor_scrape_sources;
create policy "Authenticated vendors can submit scrape URLs"
    on public.vendor_scrape_sources for insert
    with check (
        auth.role() = 'authenticated'
        and (status = 'pending' or public.is_admin())
    );

drop policy if exists "Admins can update scrape URLs" on public.vendor_scrape_sources;
create policy "Admins can update scrape URLs"
    on public.vendor_scrape_sources for update
    using (public.is_admin() or public.is_staff() or (auth.uid() = vendor_id and status = 'pending'));

drop policy if exists "Admins or owner can delete scrape URLs" on public.vendor_scrape_sources;
create policy "Admins or owner can delete scrape URLs"
    on public.vendor_scrape_sources for delete
    using (public.is_admin() or auth.uid() = vendor_id);


-- ----------------------------------------------------------------------------
-- 4. NEWSLETTER SUBSCRIBERS (READER & VENDOR EDITIONS) & CASL UNSUBSCRIBE
-- ----------------------------------------------------------------------------
create table if not exists public.newsletter_subscribers (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    first_name text default '',
    community_area text default 'All East Gwillimbury',
    audience_type text not null default 'reader' check (audience_type in ('reader', 'vendor', 'both')),
    status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
    unsubscribe_token uuid not null default gen_random_uuid(),
    created_at timestamptz not null default now(),
    confirmed_at timestamptz,
    unsubscribed_at timestamptz
);

alter table public.newsletter_subscribers
    add column if not exists audience_type text not null default 'reader';
alter table public.newsletter_subscribers
    add column if not exists confirmed_at timestamptz;

alter table public.newsletter_subscribers
    drop constraint if exists newsletter_subscribers_status_check;
alter table public.newsletter_subscribers
    add constraint newsletter_subscribers_status_check
    check (status in ('pending', 'active', 'unsubscribed'));

create index if not exists idx_subscribers_status on public.newsletter_subscribers(status);
create index if not exists idx_subscribers_token on public.newsletter_subscribers(unsubscribe_token);
alter table public.newsletter_subscribers enable row level security;

drop policy if exists "Public can subscribe to newsletter" on public.newsletter_subscribers;
create policy "Public can subscribe to newsletter"
    on public.newsletter_subscribers for insert
    with check (true);

drop policy if exists "Admins and staff can view subscribers" on public.newsletter_subscribers;
create policy "Admins and staff can view subscribers"
    on public.newsletter_subscribers for select
    using (public.is_admin() or public.is_staff());

drop policy if exists "Admins can update subscribers" on public.newsletter_subscribers;
create policy "Admins can update subscribers"
    on public.newsletter_subscribers for update
    using (public.is_admin());

-- RPC to register/upsert a subscriber as 'pending' and return their confirmation/unsubscribe token
create or replace function public.register_newsletter_subscriber(
    email_input text,
    first_name_input text default '',
    area_input text default 'All East Gwillimbury',
    audience_input text default 'reader'
)
returns jsonb
language plpgsql
security definer
as $$
declare
    clean_email text := lower(trim(email_input));
    sub_record public.newsletter_subscribers%rowtype;
begin
    insert into public.newsletter_subscribers (email, first_name, community_area, audience_type, status)
    values (
        clean_email,
        coalesce(trim(first_name_input), ''),
        coalesce(nullif(trim(area_input), ''), 'All East Gwillimbury'),
        case when audience_input in ('reader', 'vendor', 'both') then audience_input else 'reader' end,
        'pending'
    )
    on conflict (email) do update
    set first_name = case when excluded.first_name <> '' then excluded.first_name else public.newsletter_subscribers.first_name end,
        community_area = excluded.community_area,
        audience_type = excluded.audience_type,
        status = case when public.newsletter_subscribers.status = 'active' then 'active' else 'pending' end
    returning * into sub_record;

    return jsonb_build_object(
        'email', sub_record.email,
        'first_name', sub_record.first_name,
        'community_area', sub_record.community_area,
        'audience_type', sub_record.audience_type,
        'status', sub_record.status,
        'token', sub_record.unsubscribe_token::text
    );
end;
$$;

-- RPC to confirm a subscriber's email address when they click the confirmation link
create or replace function public.confirm_newsletter_subscriber(
    token_input text
)
returns jsonb
language plpgsql
security definer
as $$
declare
    sub_record public.newsletter_subscribers%rowtype;
begin
    update public.newsletter_subscribers
    set status = 'active',
        confirmed_at = coalesce(confirmed_at, now())
    where unsubscribe_token::text = trim(token_input)
    returning * into sub_record;

    if sub_record.id is null then
        return jsonb_build_object('confirmed', false);
    end if;

    return jsonb_build_object(
        'confirmed', true,
        'email', sub_record.email,
        'first_name', sub_record.first_name,
        'audience_type', sub_record.audience_type,
        'token', sub_record.unsubscribe_token::text
    );
end;
$$;

-- Table storing the latest compiled HTML for each newsletter edition ('reader' and 'vendor')
create table if not exists public.newsletter_editions (
    edition text primary key check (edition in ('reader', 'vendor')),
    subject text not null,
    html_content text not null,
    updated_at timestamptz not null default now()
);

alter table public.newsletter_editions enable row level security;

drop policy if exists "Public can read latest newsletter editions" on public.newsletter_editions;
create policy "Public can read latest newsletter editions"
    on public.newsletter_editions for select
    using (true);

drop policy if exists "Admins can upsert latest newsletter editions" on public.newsletter_editions;
create policy "Admins can upsert latest newsletter editions"
    on public.newsletter_editions for all
    using (public.is_admin());

-- RPC to upsert the latest compiled newsletter HTML from the automated pipeline
create or replace function public.save_newsletter_edition(
    edition_input text,
    subject_input text,
    html_input text
)
returns boolean
language plpgsql
security definer
as $$
begin
    if edition_input not in ('reader', 'vendor') then
        return false;
    end if;

    insert into public.newsletter_editions (edition, subject, html_content, updated_at)
    values (edition_input, subject_input, html_input, now())
    on conflict (edition) do update
    set subject = excluded.subject,
        html_content = excluded.html_content,
        updated_at = now();

    return true;
end;
$$;

-- Table storing editable newsletter settings (e.g. Vendor Promo Box & Bonus Partner Perk)
create table if not exists public.newsletter_settings (
    setting_key text primary key,
    setting_value jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.newsletter_settings enable row level security;

drop policy if exists "Public can read newsletter settings" on public.newsletter_settings;
create policy "Public can read newsletter settings"
    on public.newsletter_settings for select
    using (true);

drop policy if exists "Admins and staff can manage newsletter settings" on public.newsletter_settings;
create policy "Admins and staff can manage newsletter settings"
    on public.newsletter_settings for all
    using (public.is_admin() or public.is_staff())
    with check (public.is_admin() or public.is_staff());

create or replace function public.save_newsletter_setting(
    key_input text,
    value_input jsonb
)
returns jsonb
language plpgsql
security definer
as $$
begin
    insert into public.newsletter_settings (setting_key, setting_value, updated_at)
    values (trim(key_input), coalesce(value_input, '{}'::jsonb), now())
    on conflict (setting_key) do update
    set setting_value = excluded.setting_value,
        updated_at = now();

    return coalesce(value_input, '{}'::jsonb);
end;
$$;

insert into public.newsletter_settings (setting_key, setting_value)
values (
    'vendor_promo_box',
    jsonb_build_object(
        'heading', '⭐ Put Your Business in Front of Every Newcomer in East Gwillimbury',
        'intro', 'Want featured placement on WelcomeEG.ca and inside our hand-delivered New Resident Welcome Hampers?',
        'tier_free', 'Community Supporter (Free): Directory offer card & event submissions.',
        'tier_digital', 'Digital Sponsor ($39/mo): Featured homepage deal card + priority placement in the Thursday Reader Newsletter.',
        'tier_hamper', 'Hamper Sponsor ($95/mo): Include your physical coupons, samples, or merch in our hand-delivered Welcome Hampers to new East Gwillimbury homeowners + all Digital Sponsor perks.',
        'bonus_perk_label', 'Bonus Partner Perk — Cheerful Media 14-Day Free Trial',
        'bonus_perk_text', 'Try the Google Review Management System free for 14 days (with the $299 setup fee 100% waived for Welcome East Gwillimbury businesses!).',
        'cta_label', 'Explore Partner & Hamper Sponsorships →',
        'cta_url', 'https://welcomeeg.ca/partner',
        'selected_partner_id', ''
    )
)
on conflict (setting_key) do nothing;

-- Safe RPC function for 1-click unsubscribe across newsletter_subscribers, partners, and claims
create or replace function public.unsubscribe_reader(
    token_input text default null,
    email_input text default null
)
returns boolean
language plpgsql
security definer
as $$
declare
    target_email text := null;
    rows_updated integer := 0;
begin
    if token_input is not null and token_input <> '' then
        update public.newsletter_subscribers
        set status = 'unsubscribed',
            unsubscribed_at = now()
        where unsubscribe_token::text = token_input
        returning email into target_email;
        get diagnostics rows_updated = row_count;
    end if;

    if (target_email is null or target_email = '') and email_input is not null and email_input <> '' then
        target_email := lower(trim(email_input));
        insert into public.newsletter_subscribers (email, status, unsubscribed_at)
        values (target_email, 'unsubscribed', now())
        on conflict (email) do update
        set status = 'unsubscribed',
            unsubscribed_at = now();
        rows_updated := 1;
    end if;

    if target_email is not null and target_email <> '' then
        update public.partners
        set join_newsletter = false
        where lower(trim(contact_email)) = lower(trim(target_email));

        update public.claims
        set join_newsletter = false
        where lower(trim(email)) = lower(trim(target_email));
    end if;

    return rows_updated > 0;
end;
$$;


-- ----------------------------------------------------------------------------
-- 5. ADVERTISER & ARTICLE CLICKTHROUGH ANALYTICS
-- ----------------------------------------------------------------------------
create table if not exists public.link_clicks (
    id uuid primary key default gen_random_uuid(),
    issue_date text not null,
    article_title text not null,
    source_name text not null default 'Welcome East Gwillimbury',
    category text not null default 'general',
    target_url text not null,
    visitor_hash text default '',
    user_agent text default '',
    clicked_at timestamptz not null default now()
);

create index if not exists idx_link_clicks_issue on public.link_clicks(issue_date);
create index if not exists idx_link_clicks_source on public.link_clicks(source_name);
alter table public.link_clicks enable row level security;

drop policy if exists "Public can log link clicks" on public.link_clicks;
create policy "Public can log link clicks"
    on public.link_clicks for insert
    with check (true);

drop policy if exists "Public and authenticated users can read click analytics" on public.link_clicks;
create policy "Public and authenticated users can read click analytics"
    on public.link_clicks for select
    using (true);

create or replace view public.advertiser_click_summary as
select
    issue_date,
    source_name,
    article_title,
    category,
    target_url,
    count(*) as total_clicks,
    count(distinct nullif(visitor_hash, '')) as unique_visitors,
    max(clicked_at) as last_clicked_at
from public.link_clicks
group by issue_date, source_name, article_title, category, target_url
order by max(clicked_at) desc, count(*) desc;


-- ----------------------------------------------------------------------------
-- 6. WEBSITE & PAGE URL BLACKLIST (OPT-OUT / SCRAPER EXCLUSION LIST)
-- ----------------------------------------------------------------------------
create table if not exists public.scraped_url_blacklist (
    id uuid primary key default gen_random_uuid(),
    target_url text not null unique,
    match_type text not null default 'exact_url' check (match_type in ('domain', 'exact_url', 'prefix')),
    source_label text default '',
    reason text default '',
    active boolean not null default true,
    created_at timestamptz not null default now()
);

create index if not exists idx_scraped_url_blacklist_active on public.scraped_url_blacklist(active);
alter table public.scraped_url_blacklist enable row level security;

drop policy if exists "Public and pipeline can read url blacklist" on public.scraped_url_blacklist;
create policy "Public and pipeline can read url blacklist"
    on public.scraped_url_blacklist for select
    using (true);

drop policy if exists "Admins and staff can manage url blacklist" on public.scraped_url_blacklist;
create policy "Admins and staff can manage url blacklist"
    on public.scraped_url_blacklist for all
    using (public.is_admin() or public.is_staff())
    with check (public.is_admin() or public.is_staff());

create or replace function public.upsert_url_blacklist(
    target_url_input text,
    match_type_input text default 'exact_url',
    source_label_input text default '',
    reason_input text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    clean_target text := trim(target_url_input);
    valid_match text := case when match_type_input in ('domain', 'exact_url', 'prefix') then match_type_input else 'exact_url' end;
    rec public.scraped_url_blacklist%rowtype;
begin
    if not (public.is_admin() or public.is_staff()) then
        raise exception 'Only admins or staff can manage the URL blacklist';
    end if;

    if clean_target = '' then
        raise exception 'Target URL or domain cannot be empty';
    end if;

    insert into public.scraped_url_blacklist (target_url, match_type, source_label, reason, active)
    values (
        clean_target,
        valid_match,
        coalesce(trim(source_label_input), ''),
        coalesce(trim(reason_input), ''),
        true
    )
    on conflict (target_url) do update
    set match_type = excluded.match_type,
        source_label = case when excluded.source_label <> '' then excluded.source_label else public.scraped_url_blacklist.source_label end,
        reason = case when excluded.reason <> '' then excluded.reason else public.scraped_url_blacklist.reason end,
        active = true
    returning * into rec;

    return to_jsonb(rec);
end;
$$;

create or replace function public.delete_url_blacklist(
    id_input uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    if not (public.is_admin() or public.is_staff()) then
        raise exception 'Only admins or staff can manage the URL blacklist';
    end if;

    delete from public.scraped_url_blacklist
    where id = id_input;
    return found;
end;
$$;

revoke execute on function public.upsert_url_blacklist(text, text, text, text) from public, anon;
revoke execute on function public.delete_url_blacklist(uuid) from public, anon;
grant execute on function public.upsert_url_blacklist(text, text, text, text) to authenticated;
grant execute on function public.delete_url_blacklist(uuid) to authenticated;



-- Helper RPC: Update vendor scrape URL (security definer)
create or replace function public.update_vendor_scrape_source(
    id_input uuid,
    business_name_input text,
    submitter_email_input text,
    scrape_url_input text,
    default_location_input text,
    notes_input text,
    status_input text
)
returns void
language plpgsql
security definer
as $$
begin
    update public.vendor_scrape_sources
    set
        business_name = business_name_input,
        submitter_email = submitter_email_input,
        scrape_url = scrape_url_input,
        default_location = default_location_input,
        notes = notes_input,
        status = status_input
    where id = id_input;
end;
$$;
grant execute on function public.update_vendor_scrape_source to anon, authenticated;

-- Helper RPC: Update vendor event (security definer)
create or replace function public.update_vendor_event(
    id_input uuid,
    business_name_input text,
    submitter_email_input text,
    title_input text,
    event_date_label_input text,
    event_start_date_input date default null,
    expires_after_input date default null,
    location_input text default 'East Gwillimbury, ON',
    link_input text default 'https://welcomeeg.ca',
    summary_input text default '',
    status_input text default 'pending'
)
returns void
language plpgsql
security definer
as $$
begin
    update public.vendor_events
    set
        business_name = business_name_input,
        submitter_email = submitter_email_input,
        title = title_input,
        event_date_label = event_date_label_input,
        event_start_date = event_start_date_input,
        expires_after = expires_after_input,
        location = location_input,
        link = link_input,
        summary = summary_input,
        status = status_input
    where id = id_input;
end;
$$;
grant execute on function public.update_vendor_event to anon, authenticated;
