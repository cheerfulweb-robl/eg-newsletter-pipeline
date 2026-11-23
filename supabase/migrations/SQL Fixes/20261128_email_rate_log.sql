-- 2026-11-15: log of emails that anyone can trigger (newsletter sign-up/resend, listing and
-- hamper confirmation), used by the send-email function to allow at most 3 per address per hour.
-- Only the send-email function (service key) reads or writes it. Safe to re-run.

create table if not exists public.email_rate_log (
    id bigint generated always as identity primary key,
    recipient text not null,
    form_type text not null,
    created_at timestamptz not null default now()
);
create index if not exists idx_email_rate_log_recipient_time on public.email_rate_log (recipient, created_at desc);

alter table public.email_rate_log enable row level security;
revoke all on public.email_rate_log from anon, authenticated;
-- No policies: the public key and signed-in users cannot see or change it.

-- Keep it small: rows older than 7 days are not needed.
delete from public.email_rate_log where created_at < now() - interval '7 days';
