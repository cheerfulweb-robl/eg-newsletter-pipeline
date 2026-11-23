-- 2026-11-15 security review fixes (run once in Supabase SQL editor; safe to re-run).
-- Nothing here changes what the public site shows. See SECURITY_REVIEW_2026-11-15.md.

-- 1. Public inserts cannot pre-set the email-verification fields.
--    The verify token is only ever created by the send-email function (service role).
--    Without this, anyone could insert a listing under a stranger's email with their own
--    token, "verify" it, and get that stranger subscribed to the newsletter.
create or replace function public.wg_vendor_events_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.wg_is_trusted_caller() then
        new.verify_token := null;
        new.verify_token_expires_at := null;
        new.verified_at := null;
    end if;
    return new;
end;
$$;

drop trigger if exists wg_vendor_events_guard_insert on public.vendor_events;
create trigger wg_vendor_events_guard_insert
    before insert on public.vendor_events
    for each row execute function public.wg_vendor_events_guard_insert();

-- 2. Newsletter: the public may only add PENDING subscribers (double opt-in).
--    Before: check (true), so a direct insert could create an ACTIVE subscriber.
drop policy if exists "Public can subscribe to newsletter" on public.newsletter_subscribers;
create policy "Public can subscribe to newsletter"
    on public.newsletter_subscribers for insert
    with check (status = 'pending');

-- 3. Listing images must be https (or an uploaded data:image). Blocks javascript: URLs.
--    NOT VALID: existing rows are not checked, new and edited rows are.
alter table public.vendor_events drop constraint if exists vendor_events_image_url_check;
alter table public.vendor_events
    add constraint vendor_events_image_url_check
    check (image_url is null or image_url ~* '^(pending:)?(https://|data:image/(png|jpe?g|webp|gif);base64,)')
    not valid;

-- 4. Retired coupon functions (old redemption portal, no longer on the site):
--    no anonymous calls. generate_presentation_token is still used and is left alone.
revoke execute on function public.verify_presentation_code(text, text) from anon, public;
revoke execute on function public.redeem_coupon_code(text, text) from anon, public;
