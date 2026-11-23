# Duplicate Listing Detection & Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intercept and alert submitters when an event/deal duplicates existing information, with an optional bypass that flags the listing for staff manual review.

**Architecture:** A PostgreSQL `SECURITY DEFINER` function (`wg_check_listing_duplicate`) calculates a multi-factor confidence score (fuzzy title, exact date, venue, URL, email). `ListingSubmissionForm.jsx` queries this function before insertion. If high confidence ($\ge 70$), a modal appears showing the match with an optional bypass. Bypassed submissions carry `is_suspected_duplicate` flags to `website/staff/admin-approvals.html` where staff see a comparison badge.

**Tech Stack:** PostgreSQL (pg_trgm extension, Supabase RPC), React / Vite, TailwindCSS, Lucide icons, Vitest, Python unittest.

**Spec:** [specs/2026-11-17-duplicate-listing-alert-design.md](file:///C:/Users/robel/WebProjects/welcomegeorgina-redesign/specs/2026-11-17-duplicate-listing-alert-design.md)

## Global Constraints
- Assistant never writes directly to live database or cPanel; provide migration in `supabase/migrations/` and production zip in `_work/`.
- Fast failover: if the RPC is unavailable (e.g. migration pending), submission proceeds normally so submitters are never blocked by database latency or errors.
- Privacy: The duplicate check RPC must only return sanitized public fields (`title`, `event_date_label`, `community`, `location_name`, `link`, `status`), never submitter emails or phone numbers.
- Version bump: Increment release to **v66.8**.

## Review Focus
- **Whitespace / case insensitivity:** URLs with trailing slashes and titles with varied capitalization or punctuation must normalize properly.
- **Graceful degradation:** If `pg_trgm` extension or RPC call encounters an error, catch and allow normal submission.
- **Recurring / series events:** Part 1 and Part 2 (e.g. "Workshop Part 1" vs "Workshop Part 2") should not be hard-blocked; the bypass allows user to proceed.
- **No data loss on bypass:** Clicking "Submit Anyway" must preserve all user-typed inputs and files.
- **Mobile responsiveness:** The duplicate warning modal must fit cleanly on 320px–375px mobile screens.

---

### Task 1: Database Migration (`supabase/migrations/20261214_duplicate_listing_detection.sql`)

**Files:**
- Create: `supabase/migrations/20261214_duplicate_listing_detection.sql`
- Test: `tests/test_duplicate_sql.py`

- [ ] **Step 1: Write migration SQL file**
  - Enable `create extension if not exists pg_trgm;`
  - Add columns to `public.vendor_events`:
    - `is_suspected_duplicate boolean not null default false`
    - `duplicate_match_id text`
    - `duplicate_score smallint check (duplicate_score is null or duplicate_score between 0 and 100)`
    - `duplicate_notes text`
  - Create index on `is_suspected_duplicate` where true.
  - Implement `public.wg_check_listing_duplicate` function:
    - Normalizes inputs (trims URLs, strips protocols/trailing slashes).
    - Checks `vendor_events` where `status in ('approved', 'pending', 'pending_verification')` and `(expires_after is null or expires_after >= current_date - 14)`.
    - Computes score according to matrix:
      - Link match: +50
      - Exact start date: +30 (or overlap: +15)
      - Title similarity: +45 if $\ge 0.85$, +25 if $\ge 0.65$
      - Venue/address match: +20 (+5 for community)
      - Submitter email match: +15
    - Returns JSONB with `has_duplicate`, `confidence` ('high' if $\ge 70$, 'medium' if $\ge 45$, else 'none'), `score`, `match_reasons`, and sanitized `matched_listing`.
  - Grant execute on function to `anon`, `authenticated`, `service_role`.
- [ ] **Step 2: Add Python unit test for SQL syntax & safety**
  - Create `tests/test_duplicate_sql.py` verifying SQL file exists, has no destructive statements, contains proper grants, and has syntax-valid RPC structure.
- [ ] **Step 3: Run Python test suite**
  - Run `python -m unittest tests.test_duplicate_sql` and verify it passes.

---

### Task 2: Duplicate Warning Modal Component

**Files:**
- Create: `site-src/src/components/submission/DuplicateWarningModal.jsx`
- Test: `site-src/tests/duplicate_modal.test.jsx`

- [ ] **Step 1: Create `DuplicateWarningModal.jsx`**
  - Props: `isOpen`, `matchedListing`, `matchReasons`, `score`, `onCancel`, `onBypass`, `isSubmitting`.
  - Render an accessible modal dialog:
    - Alert header with warning icon: "Possible Duplicate Listing".
    - Matched item details card: Title, date label, community / venue, website link, and status badge (`Currently Live` or `Under Review`).
    - Match reasons pill badges (e.g. "Matching Date", "88% Title Similarity").
    - Action 1: "Never Mind, Keep Existing" (calls `onCancel`).
    - Action 2: "Submit Anyway (Request Manual Review)" (calls `onBypass`).
- [ ] **Step 2: Write Vitest component tests**
  - Test modal renders matched title, date, and reasons when open.
  - Test clicking "Never Mind" triggers `onCancel`.
  - Test clicking "Submit Anyway" triggers `onBypass`.
- [ ] **Step 3: Run Vitest tests**
  - Verify `duplicate_modal.test.jsx` passes.

---

### Task 3: Integration into `ListingSubmissionForm.jsx`

**Files:**
- Modify: `site-src/src/components/submission/ListingSubmissionForm.jsx`
- Modify: `site-src/src/components/submission/submissionLogic.js`
- Test: `site-src/tests/submission_duplicate.test.jsx`

- [ ] **Step 1: Update `submissionLogic.js`**
  - Add `buildDuplicateCheckParams(kind, fields, schedule)` helper to format arguments for `wg_check_listing_duplicate`.
- [ ] **Step 2: Update `ListingSubmissionForm.jsx`**
  - State: `duplicateWarning: { isOpen: false, matchedListing: null, matchReasons: [], score: 0, pendingPayload: null }`.
  - In `handleSubmit`:
    - Before inserting, call `supabase.rpc('wg_check_listing_duplicate', params)`.
    - If `data?.confidence === 'high'` and not already bypassed:
      - Set `duplicateWarning` state and return early (holding `payload`).
    - If `data?.confidence === 'medium'`:
      - Attach `duplicate_score` and `duplicate_notes` to payload silently.
    - If RPC throws an error: log warning and proceed to insert without blocking.
  - Implement `handleBypassDuplicate`:
    - Merges `is_suspected_duplicate: true`, `duplicate_match_id`, `duplicate_score`, and `duplicate_notes` into payload.
    - Calls Supabase insert and finishes normal submission flow.
- [ ] **Step 3: Write Vitest integration test**
  - Test `handleSubmit` catches duplicate and shows modal.
  - Test bypassing inserts with `is_suspected_duplicate: true`.
  - Test RPC failure fails open (still submits).
- [ ] **Step 4: Run all Vitest tests**
  - Verify all tests in `site-src` pass.

---

### Task 4: Staff Approvals Queue UI (`website/staff/admin-approvals.html`)

**Files:**
- Modify: `website/staff/admin-approvals.html`

- [ ] **Step 1: Add duplicate badge to pending approval cards**
  - In card rendering logic:
    - Check if `r.is_suspected_duplicate` is true or `r.duplicate_match_id` is present.
    - Render prominent pill: `<span class="badge" style="background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; font-weight:700;">⚠️ Suspected Duplicate (${r.duplicate_score || 70}%)</span>`.
    - In `Submitted info` section, add `Duplicate of:` with link/ID and `Duplicate reasons:` with `r.duplicate_notes`.
- [ ] **Step 2: Add 1-click comparison modal/drawer**
  - Add button `"Compare with existing"` on suspected duplicate cards that pulls up both listings side-by-side.

---

### Task 5: Build Production Package & Handover Update

**Files:**
- Modify: `HANDOVER_2026-11-17.md`
- Build: `_work/wg_production_deploy_2026-11-17_v66.8.zip`

- [ ] **Step 1: Bump version in `_work/build_production.py` to `v66.8`**
- [ ] **Step 2: Run build script**
  - Generate `_work/wg_production_deploy_2026-11-17_v66.8.zip`.
  - Verify file count and permissions (644).
- [ ] **Step 3: Update `HANDOVER_2026-11-17.md`**
  - Document v66.8 release notes, new migration, and testing checklist.
- [ ] **Step 4: Run full test suites**
  - Verify all Vitest and Python tests pass.
- [ ] **Step 5: Git commit and push**
  - Commit all changes and push `main` and `redesign-b` to `origin`.
