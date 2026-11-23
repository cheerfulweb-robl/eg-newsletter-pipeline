-- 2026-11-15: how sure we are that a listing was read correctly (AI import or crawler).
-- 0-100: 80+ high, 60-79 medium, below 60 low (needs a human check). Null = not scored yet;
-- the staff page then scores it from the listing's own fields.
-- Staff only: the public key cannot read these columns (see 20261125). Safe to re-run.

alter table public.vendor_events add column if not exists data_confidence smallint
    check (data_confidence is null or data_confidence between 0 and 100);
alter table public.vendor_events add column if not exists confidence_notes text;

create index if not exists idx_vendor_events_low_confidence
    on public.vendor_events (data_confidence) where data_confidence < 60;
