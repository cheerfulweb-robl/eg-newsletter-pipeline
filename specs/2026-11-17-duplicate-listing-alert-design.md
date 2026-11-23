# Design Document: Duplicate Listing Detection & Warning System

**Date:** 2026-11-17  
**Status:** Pending Approval  
**Author:** Antigravity & Robert Lee  
**Target Release:** v66.8  

---

## 1. Intent & Why

When users submit community events, yard sales, or dining specials to Welcome Georgina, duplicate listings occasionally occur:
1. The same person accidentally resubmits or submits twice while waiting for approval.
2. Two members of the same organization or community submit the same event under different emails.
3. A public user submits an event that the automated crawler or staff already published.

These duplicates clutter the approvals queue and create confusion for readers if approved. We need a proactive duplicate-detection check at the time of submission that:
- Detects near-duplicates and exact duplicates with high confidence using multiple matching signals (date, time, venue, title similarity, and listing link).
- Alerts the submitter with a friendly warning modal showing the matching existing listing before submission completes.
- Provides an optional bypass ("Submit anyway / Request manual review") so distinct events that happen to share dates or locations are never completely blocked.
- Automatically flags bypassed duplicates in the database and surfaces them clearly in the staff approvals queue with side-by-side comparison.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Proactive Interception:** Catch duplicates before they enter the database, reducing staff review overhead.
- **Explainable Matching:** Show the user exactly which listing matched and why (e.g. "Matches 'Jackson's Point Craft Market' on Dec 5 at The ROC").
- **Graceful Bypass:** Allow users with legitimate reasons (e.g. part 2, distinct session) to proceed with explicit manual review flagging.
- **Fast & Zero Cost:** Sub-100ms response time using Postgres `pg_trgm` similarity and heuristic scoring directly in Supabase (Option 1).
- **Staff Visibility:** Clear visual indicator and side-by-side comparison in `website/staff/admin-approvals.html`.

### Non-Goals
- **Zero Hallucination AI:** No external LLM dependencies, ensuring deterministic, instant scoring without recurring API cost.
- **Cross-site web scraping during submission:** The check operates strictly against existing approved and pending listings in `vendor_events`.

### Anti-Goals
- **Hard Lockout / Brick Wall:** Submissions must never be hard-blocked with no recourse. The user always has the option to request manual review.
- **Privacy Leakage:** Row-Level Security hides pending listings from the public. The duplicate check RPC must only expose public-safe summary fields (`title`, `event_date_label`, `community`, `location_name`, `link`, `status`), never submitter emails or phone numbers.

---

## 3. Approaches Considered

| Approach | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Option 1: In-Database Postgres Matcher (`pg_trgm` + Heuristics)** | PostgreSQL stored procedure (`SECURITY DEFINER`) evaluating fuzzy title similarity, date match, venue, URL, and submitter email. | Instant (<80ms), zero cost, queries both live and pending records securely without leaking personal data. | Requires SQL migration for `pg_trgm` extension and scoring function. | **Selected (Recommended)** |
| **Option 2: Supabase Edge Function + LLM (Gemini API)** | Edge function sends candidate and top candidates to Gemini for semantic evaluation. | Understands nuanced rephrasings (e.g. "St. Andrew's Bazaar" vs "Fall Market at Church"). | Adds 1.5s+ submission latency, API cost, and external failure mode. | Rejected |
| **Option 3: Pure Client-Side Matcher** | Frontend queries active listings and runs string distance in JavaScript. | No backend changes. | Cannot check against pending submissions (due to RLS), easily bypassed, requires downloading large dataset. | Rejected |

---

## 4. Detection Logic & Scoring Matrix

The database function `wg_check_listing_duplicate` scores candidate submissions against existing listings active within ±14 days (or all non-expired listings):

| Signal | Condition | Score Contribution |
|---|---|---|
| **Event Link / URL** | Normalized URL matches an existing listing link | **+50 pts** |
| **Date & Time** | Candidate start date matches existing start date exactly | **+30 pts** |
| **Date Range Overlap** | Multi-day date ranges overlap | **+15 pts** |
| **Title Similarity (`pg_trgm`)** | Similarity >= 0.85 (after title clean) | **+45 pts** |
| **Title Similarity (`pg_trgm`)** | Similarity between 0.65 and 0.84 | **+25 pts** |
| **Venue / Location** | Venue name or street address matches | **+20 pts** |
| **Community** | Same community (e.g. Keswick, Sutton) | **+5 pts** |
| **Submitter Email** | Submitter email matches existing submitter email | **+15 pts** |

### Confidence Thresholds
- **High Confidence ($\ge 70$ points):**
  - Triggers the on-screen Warning Modal.
  - Examples:
    - Same Date (+30) + 85% Title Match (+45) = **75 pts (High)**
    - Same URL (+50) + Same Date (+30) = **80 pts (High)**
    - Same Date (+30) + Same Venue (+20) + 65% Title (+25) = **75 pts (High)**
- **Medium Confidence (45–69 points):**
  - Does *not* interrupt the submitter with a modal, but flags the listing in the database for staff review.
- **Low / Clean ($< 45$ points):**
  - Standard smooth submission.

---

## 5. User Interface & Experience

### A. Submitter Flow (`ListingSubmissionForm.jsx`)
1. User completes form and clicks **Submit Listing**.
2. Form validates input format locally (required fields, valid dates).
3. Form calls `supabase.rpc('wg_check_listing_duplicate', { ...candidate_fields })`.
4. If High Confidence is returned:
   - Stops submission flow and opens the **Possible Duplicate Modal**:
     - **Header:** ⚠️ "This Event May Already Be Listed"
     - **Match Summary Card:** Displays the existing listing's title, date, community/venue, website link, and status badge (`Live on site` or `Under staff review`).
     - **Reasons:** e.g. "Matches date (Dec 12, 2026), venue (The ROC), and title similarity (88%)."
     - **Button 1 (Primary / Safe):** "Never Mind — Keep Existing Listing" (Closes modal, resets form or redirects to browse).
     - **Button 2 (Secondary / Bypass):** "Submit Anyway (Request Manual Review)" (Proceeds with insert, sending `is_suspected_duplicate: true`, `duplicate_match_id`, and `duplicate_notes`).
5. If Medium Confidence or Low Confidence:
   - Proceeds directly to insertion; medium confidence attaches `duplicate_score` and `duplicate_notes` for staff without interrupting the submitter.

### B. Staff Approvals Flow (`website/staff/admin-approvals.html`)
- On cards where `is_suspected_duplicate` is true or `duplicate_match_id` is set:
  - Renders a high-visibility badge: `[⚠️ Suspected Duplicate: 85% match with #listing_id]`.
  - Clicking the badge opens a side-by-side modal showing the new submission vs. the existing listing to make approval/rejection instantaneous for Robert.

---

## 6. Schema Changes (Migration `20261214_duplicate_listing_detection.sql`)

```sql
-- Enable trigram extension for fuzzy title matching
create extension if not exists pg_trgm;

-- Add duplicate tracking columns to vendor_events
alter table public.vendor_events
    add column if not exists is_suspected_duplicate boolean default false,
    add column if not exists duplicate_match_id text,
    add column if not exists duplicate_score smallint,
    add column if not exists duplicate_notes text;

-- Index for staff queue filtering
create index if not exists idx_vendor_events_suspected_duplicate
    on public.vendor_events (is_suspected_duplicate)
    where is_suspected_duplicate = true;

-- RPC function callable by anon/authenticated to check duplicates safely
create or replace function public.wg_check_listing_duplicate(
    p_title text,
    p_start_date date,
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
...
$$;

grant execute on function public.wg_check_listing_duplicate to anon, authenticated, service_role;
```

---

## 7. What is Left to the Builder

1. Write `supabase/migrations/20261214_duplicate_listing_detection.sql` implementing `wg_check_listing_duplicate` with normalized URL and title comparisons.
2. Build `DuplicateWarningModal` component in `site-src/src/components/submission/DuplicateWarningModal.jsx`.
3. Integrate pre-flight check in `ListingSubmissionForm.jsx` `handleSubmit`.
4. Add duplicate badge and comparison modal to `website/staff/admin-approvals.html`.
5. Add automated unit and integration tests (Vitest for modal and RPC mocks; Python test for migration safety).
