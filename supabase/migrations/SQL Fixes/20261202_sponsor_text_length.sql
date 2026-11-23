-- 2026-11-16: sponsored "Try searching" pills on the Home page are now double height,
-- so their text may be up to 90 characters (was 40). Safe to re-run.
alter table public.search_sponsors drop constraint if exists search_sponsors_keyword_len;
alter table public.search_sponsors
    add constraint search_sponsors_keyword_len check (char_length(btrim(keyword)) between 2 and 90);
