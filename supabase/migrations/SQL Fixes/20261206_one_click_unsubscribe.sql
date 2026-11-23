-- 2026-11-16: One-click unsubscribe for every email (CASL), and no more unsubscribing by typed email.
--
-- Before: unsubscribe_reader accepted a bare email address from anyone, so a stranger could
-- remove any address from the newsletter. Readers from claims/partners and every email sent by
-- the send-email function had no token, so their link made them retype their address.
--
-- Now:
--   * wg_unsubscribe_tokens holds a random token per email address (for people who are not in
--     newsletter_subscribers, or emails that are not newsletters). Tokens never expire, so links
--     in emails already sent keep working (CASL: at least 60 days).
--   * wg_unsubscribe_tokens_for(emails[]) issues/looks up tokens. Server side only (service key
--     or staff): the newsletter pipeline and the send-email function call it.
--   * unsubscribe_reader only unsubscribes with a valid token (a newsletter_subscribers token or
--     a wg_unsubscribe_tokens token). email_input is still accepted but ignored, so a cached old
--     copy of the page does not error. Returns false for an unknown token.
-- Run in the Supabase SQL editor BEFORE uploading the site and redeploying send-email.

create table if not exists public.wg_unsubscribe_tokens (
    email text primary key,
    token uuid not null unique default gen_random_uuid(),
    created_at timestamptz not null default now()
);
alter table public.wg_unsubscribe_tokens enable row level security;
revoke all on public.wg_unsubscribe_tokens from anon, authenticated;

create or replace function public.wg_unsubscribe_tokens_for(emails_input text[])
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
    result jsonb;
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;

    insert into public.wg_unsubscribe_tokens (email)
    select distinct lower(btrim(e))
    from unnest(coalesce(emails_input, '{}'::text[])) e
    where position('@' in coalesce(e, '')) > 1
    on conflict (email) do nothing;

    select coalesce(jsonb_object_agg(t.email, t.token::text), '{}'::jsonb) into result
    from public.wg_unsubscribe_tokens t
    where t.email in (select lower(btrim(e)) from unnest(coalesce(emails_input, '{}'::text[])) e);

    return result;
end;
$function$;

revoke all on function public.wg_unsubscribe_tokens_for(text[]) from public, anon, authenticated;
grant execute on function public.wg_unsubscribe_tokens_for(text[]) to service_role;

create or replace function public.unsubscribe_reader(
    token_input text default null,
    email_input text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
    t text := btrim(coalesce(token_input, ''));
    target_email text := null;
begin
    -- email_input is ignored on purpose: only the link from one of our emails can unsubscribe.
    if t = '' then
        return false;
    end if;

    update public.newsletter_subscribers
    set status = 'unsubscribed',
        unsubscribed_at = now()
    where unsubscribe_token::text = t
    returning email into target_email;

    if target_email is null then
        select email into target_email from public.wg_unsubscribe_tokens where token::text = t;
        if target_email is null then
            return false;
        end if;
        insert into public.newsletter_subscribers (email, status, unsubscribed_at)
        values (target_email, 'unsubscribed', now())
        on conflict (email) do update
        set status = 'unsubscribed',
            unsubscribed_at = now();
    end if;

    update public.partners
    set join_newsletter = false
    where lower(trim(contact_email)) = lower(trim(target_email));

    update public.claims
    set join_newsletter = false
    where lower(trim(email)) = lower(trim(target_email));

    return true;
end;
$function$;

grant execute on function public.unsubscribe_reader(text, text) to anon, authenticated;

-- Check: should return one row per object.
select 'table' as kind, to_regclass('public.wg_unsubscribe_tokens')::text as name
union all select 'function', 'wg_unsubscribe_tokens_for' where to_regprocedure('public.wg_unsubscribe_tokens_for(text[])') is not null
union all select 'function', 'unsubscribe_reader' where to_regprocedure('public.unsubscribe_reader(text,text)') is not null;
