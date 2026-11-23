-- 2026-11-16: twice-weekly newsletter. The pipeline now saves two editions:
--   'monday' = Monday edition (listings Monday to Friday)
--   'reader' = Thursday edition (listings Friday to Sunday; existing key kept)
-- Also: one archive row per edition per day (a re-run that day replaces it instead of
-- adding a duplicate).
-- Run in the Supabase SQL editor before the next scheduled Monday run.

-- Drop any check constraint that only allows the old edition names.
do $$
declare c record;
begin
    for c in
        select con.conname, rel.relname
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace nsp on nsp.oid = rel.relnamespace
        where nsp.nspname = 'public'
          and rel.relname in ('newsletter_editions', 'newsletter_archive')
          and con.contype = 'c'
          and pg_get_constraintdef(con.oid) ilike '%edition%'
    loop
        execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
    end loop;
end $$;

create or replace function public.save_newsletter_edition(edition_input text, subject_input text, html_input text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
begin
    if not public.wg_is_trusted_caller() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if edition_input not in ('reader', 'vendor', 'monday') then
        return false;
    end if;

    insert into public.newsletter_editions (edition, subject, html_content, updated_at)
    values (edition_input, subject_input, html_input, now())
    on conflict (edition) do update
    set subject = excluded.subject,
        html_content = excluded.html_content,
        updated_at = now();

    -- One archive entry per edition per day
    delete from public.newsletter_archive
    where edition = edition_input and issue_date = current_date;
    insert into public.newsletter_archive (edition, subject, html_content, issue_date, published_at)
    values (edition_input, subject_input, html_input, current_date, now());

    return true;
end;
$function$;

