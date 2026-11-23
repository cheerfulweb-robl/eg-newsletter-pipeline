-- Lock down URL blacklist RPCs: security definer functions must verify admin/staff.
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
