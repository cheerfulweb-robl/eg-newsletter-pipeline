-- Migration: 20261214_duplicate_listing_detection.sql
-- Goal: Duplicate listing detection for event, dining, and sale submissions.
-- Evaluates candidates against active and pending records in public.vendor_events.

-- 1. Enable pg_trgm for fuzzy string similarity
create extension if not exists pg_trgm;

-- 2. Add duplicate tracking columns to vendor_events
alter table public.vendor_events
    add column if not exists is_suspected_duplicate boolean not null default false,
    add column if not exists duplicate_match_id text,
    add column if not exists duplicate_score smallint check (duplicate_score is null or duplicate_score between 0 and 100),
    add column if not exists duplicate_notes text;

-- 3. Create index on suspected duplicates for quick staff queue retrieval
create index if not exists idx_vendor_events_suspected_duplicate
    on public.vendor_events (is_suspected_duplicate)
    where is_suspected_duplicate = true;

-- 4. Duplicate check RPC function (SECURITY DEFINER to query pending listings safely without leaking submitter emails)
create or replace function public.wg_check_listing_duplicate(
    p_title text,
    p_start_date date default null,
    p_end_date date default null,
    p_location text default null,
    p_community text default null,
    p_link text default null,
    p_email text default null,
    p_kind text default 'event'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_clean_cand_title text;
    v_clean_cand_link text;
    v_clean_cand_email text;
    v_cand_location text;
    v_cand_comm text;
    
    r record;
    v_best_id text := null;
    v_best_title text := null;
    v_best_dates text := null;
    v_best_loc text := null;
    v_best_comm text := null;
    v_best_link text := null;
    v_best_status text := null;
    v_best_score integer := 0;
    v_best_reasons text[] := array[]::text[];
    
    v_cur_score integer;
    v_cur_reasons text[];
    v_title_sim real;
    v_clean_rec_link text;
    v_clean_rec_title text;
begin
    -- Sanitize candidate inputs
    v_clean_cand_title := lower(trim(regexp_replace(coalesce(p_title, ''), '^\s*\[[^\]]+\]\s*', '', 'g')));
    v_clean_cand_email := lower(trim(coalesce(p_email, '')));
    v_cand_location := lower(trim(coalesce(p_location, '')));
    v_cand_comm := lower(trim(coalesce(p_community, '')));
    
    -- Normalize link: strip http/https, www., query strings, trailing slashes
    if p_link is not null and length(trim(p_link)) > 5 then
        v_clean_cand_link := regexp_replace(lower(trim(p_link)), '^https?://(www\.)?', '');
        v_clean_cand_link := split_part(v_clean_cand_link, '?', 1);
        v_clean_cand_link := rtrim(v_clean_cand_link, '/');
    else
        v_clean_cand_link := '';
    end if;

    if length(v_clean_cand_title) < 2 then
        return jsonb_build_object(
            'has_duplicate', false,
            'confidence', 'none',
            'score', 0,
            'reasons', '[]'::jsonb,
            'matched_listing', null
        );
    end if;

    -- Search across relevant listings: active/pending, within a 14-day window (or non-expired)
    for r in
        select 
            id,
            title,
            event_date_label,
            event_start_date,
            expires_after,
            location,
            community,
            link,
            submitter_email,
            status
        from public.vendor_events
        where status in ('approved', 'pending', 'pending_verification')
          and (
              -- If candidate date is known, search within 14 days; otherwise search unexpired listings
              (p_start_date is not null and (
                  event_start_date between (p_start_date - interval '14 days') and (p_start_date + interval '14 days')
                  or (expires_after is not null and expires_after >= p_start_date)
              ))
              or (p_start_date is null and (expires_after is null or expires_after >= current_date - interval '7 days'))
          )
        order by created_at desc
        limit 150
    loop
        v_cur_score := 0;
        v_cur_reasons := array[]::text[];
        v_clean_rec_title := lower(trim(regexp_replace(coalesce(r.title, ''), '^\s*\[[^\]]+\]\s*', '', 'g')));

        -- 1. Exact Link / URL match (+50)
        if length(v_clean_cand_link) > 5 and r.link is not null and length(trim(r.link)) > 5 then
            v_clean_rec_link := regexp_replace(lower(trim(r.link)), '^https?://(www\.)?', '');
            v_clean_rec_link := split_part(v_clean_rec_link, '?', 1);
            v_clean_rec_link := rtrim(v_clean_rec_link, '/');
            if v_clean_cand_link = v_clean_rec_link then
                v_cur_score := v_cur_score + 50;
                v_cur_reasons := array_append(v_cur_reasons, 'Matching event link / URL');
            end if;
        end if;

        -- 2. Date match (+30 for exact start, +15 for overlap)
        if p_start_date is not null and r.event_start_date is not null then
            if p_start_date = r.event_start_date then
                v_cur_score := v_cur_score + 30;
                v_cur_reasons := array_append(v_cur_reasons, 'Same event date (' || to_char(p_start_date, 'Mon DD, YYYY') || ')');
            elsif p_end_date is not null and r.expires_after is not null and (p_start_date <= r.expires_after and p_end_date >= r.event_start_date) then
                v_cur_score := v_cur_score + 15;
                v_cur_reasons := array_append(v_cur_reasons, 'Overlapping event dates');
            end if;
        end if;

        -- 3. Fuzzy Title Similarity via pg_trgm (+45 for >= 0.85, +25 for >= 0.65)
        v_title_sim := similarity(v_clean_rec_title, v_clean_cand_title);
        if v_title_sim >= 0.85 then
            v_cur_score := v_cur_score + 45;
            v_cur_reasons := array_append(v_cur_reasons, round((v_title_sim * 100)::numeric, 0)::text || '% title match');
        elsif v_title_sim >= 0.65 then
            v_cur_score := v_cur_score + 25;
            v_cur_reasons := array_append(v_cur_reasons, round((v_title_sim * 100)::numeric, 0)::text || '% title match');
        end if;

        -- 4. Location / Venue Match (+20)
        if length(v_cand_location) > 3 and r.location is not null and length(trim(r.location)) > 3 then
            if lower(r.location) like '%' || v_cand_location || '%' or v_cand_location like '%' || lower(r.location) || '%' then
                v_cur_score := v_cur_score + 20;
                v_cur_reasons := array_append(v_cur_reasons, 'Matching venue / address');
            end if;
        end if;

        -- 5. Community Match (+5)
        if length(v_cand_comm) > 2 and r.community is not null and lower(trim(r.community)) = v_cand_comm then
            v_cur_score := v_cur_score + 5;
        end if;

        -- 6. Same Submitter Email (+15)
        if length(v_clean_cand_email) > 3 and r.submitter_email is not null and lower(trim(r.submitter_email)) = v_clean_cand_email then
            v_cur_score := v_cur_score + 15;
            v_cur_reasons := array_append(v_cur_reasons, 'Submitted under same contact email');
        end if;

        -- Cap score at 100
        if v_cur_score > 100 then
            v_cur_score := 100;
        end if;

        -- Retain highest scoring candidate
        if v_cur_score > v_best_score then
            v_best_score := v_cur_score;
            v_best_id := r.id;
            v_best_title := r.title;
            v_best_dates := coalesce(r.event_date_label, to_char(r.event_start_date, 'Mon DD, YYYY'));
            v_best_loc := r.location;
            v_best_comm := r.community;
            v_best_link := r.link;
            v_best_status := r.status;
            v_best_reasons := v_cur_reasons;
        end if;
    end loop;

    -- Return JSONB payload
    if v_best_score >= 70 then
        return jsonb_build_object(
            'has_duplicate', true,
            'confidence', 'high',
            'score', v_best_score,
            'reasons', to_jsonb(v_best_reasons),
            'matched_listing', jsonb_build_object(
                'id', v_best_id,
                'title', v_best_title,
                'event_date_label', v_best_dates,
                'location', v_best_loc,
                'community', v_best_comm,
                'link', v_best_link,
                'status', v_best_status
            )
        );
    elsif v_best_score >= 45 then
        return jsonb_build_object(
            'has_duplicate', true,
            'confidence', 'medium',
            'score', v_best_score,
            'reasons', to_jsonb(v_best_reasons),
            'matched_listing', jsonb_build_object(
                'id', v_best_id,
                'title', v_best_title,
                'event_date_label', v_best_dates,
                'location', v_best_loc,
                'community', v_best_comm,
                'link', v_best_link,
                'status', v_best_status
            )
        );
    else
        return jsonb_build_object(
            'has_duplicate', false,
            'confidence', 'none',
            'score', v_best_score,
            'reasons', '[]'::jsonb,
            'matched_listing', null
        );
    end if;
end;
$$;

-- Grant execution permissions
grant execute on function public.wg_check_listing_duplicate to anon, authenticated, service_role;
