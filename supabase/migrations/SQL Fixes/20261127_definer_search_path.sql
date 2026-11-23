-- 2026-11-15: every SECURITY DEFINER function in the public schema gets a fixed search_path.
-- Without one, a function that runs with owner rights resolves table and function names
-- through the caller's search_path, which is a known privilege-escalation pattern.
-- "extensions" is included because Supabase keeps pgcrypto (gen_random_bytes, digest, ...)
-- there and some functions call it without a schema name.
-- Only functions that have no search_path yet are changed. Safe to re-run.

do $$
declare
    f record;
begin
    for f in
        select p.oid::regprocedure as sig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prosecdef
          and not exists (
              select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c
              where c like 'search_path=%'
          )
    loop
        execute format('alter function %s set search_path = public, extensions, pg_temp', f.sig);
        raise notice 'search_path set on %', f.sig;
    end loop;
end;
$$;

-- To see the result:
--   select p.oid::regprocedure, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosecdef order by 1;
