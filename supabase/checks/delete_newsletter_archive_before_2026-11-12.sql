-- One-time cleanup (2026-11-16): delete newsletter archive editions dated before 2026-11-12.
-- They were test runs; no backup wanted (the user's decision).
-- Run in the Supabase SQL editor. Step 1 shows what will go; step 2 deletes it.

-- Step 1: preview
select id, edition, subject, issue_date, published_at
from public.newsletter_archive
where coalesce(issue_date::date, published_at::date) < date '2026-11-12'
order by issue_date, published_at;

-- Step 2: delete (run after checking step 1)
-- delete from public.newsletter_archive
-- where coalesce(issue_date::date, published_at::date) < date '2026-11-12';

-- Step 3: what is left
-- select edition, issue_date, subject from public.newsletter_archive order by issue_date desc;
