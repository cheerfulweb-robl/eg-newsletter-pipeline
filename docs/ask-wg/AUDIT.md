# Ask WG — Repository & Architecture Audit (Gate A)

**Project:** WelcomeGeorgina.ca — **Ask WG** Local Discovery AI Chatbot  
**Date:** 2026-11-23  
**Repository:** `cheerfulweb-robl/georgina-newsletter-pipeline` (`main` at `c1c3384`)  
**Supabase Project:** `dtyyptbqbwvwxvtexenr`  
**Status:** Read-only audit complete; awaiting owner approval for **Gate A** before creating database migrations or Edge Functions.

---

## 1. Frontend Technology & Site-Wide Widget Mount Point

- **SPA Stack:** React + Vite + Tailwind CSS in `site-src/` (`site-src/src/App.jsx`, built to `site-src/dist/` and packaged into `public_html/wg/` via `_work/build_production.py` using `pnpm@10.12.1`).
- **Mount Point:** `site-src/src/App.jsx` wraps all public React routes inside `<Router>` with persistent site-wide chrome:
  - `<Navbar />`
  - `<HeroGallery />`
  - `<main id="main-content"><Routes>...</Routes></main>`
  - `<Footer />`
  - `<MobileBottomNav />`
  - `<BugReportModal />`
- **Recommended Widget Placement:** Lazy-load `<AskWgWidget />` (`React.lazy` + `Suspense`) right alongside `<BugReportModal />` in `site-src/src/App.jsx` so it loads asynchronously without blocking initial render or Core Web Vitals, and position its floating launcher above `<MobileBottomNav />` on mobile (`pb-16 lg:pb-0`) to avoid overlapping mobile navigation.
- **Static Portals:** `website/news/`, `website/hamper/`, `website/staff/`, and `website/business/` are standalone HTML pages outside React Router. Initial launch should target the main React SPA (`welcomegeorgina.ca/*`), with an optional lightweight loader later if desired.

---

## 2. Existing Supabase Project, Tables, Edge Functions & Auth Patterns

- **Project ID:** `dtyyptbqbwvwxvtexenr` (`https://dtyyptbqbwvwxvtexenr.supabase.co`).
- **Client Auth Pattern:** Public SPA uses `site-src/src/supabaseClient.js` with the `anon` key (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). **No `service_role` key is ever shipped to the client.**
- **Authoritative Public Tables (RLS-gated):**
  - `public.vendor_events`: Events, dining specials, retail sales (`special_sale` / `sales`), and local news (`local_news`, `municipal_news`, `news`). Public reads require `status = 'approved'`. Key columns used by the site/pipeline: `id`, `slug`, `title`, `business_name`, `category`, `status`, `event_date_label`, `event_start_date`, `expires_after`, `date_type`, `recurrence_rule`, `location`, `summary`, `price_text`, `link`, `image_url`. (`submitter_email` is revoked from `anon`/`authenticated`.)
  - `public.directory_listings`: Local business directory (`status = 'approved'`, `name`, `slug`, `category`, `community`, `location`, `phone`, `link`, `notes`, `google_place_id`).
  - `public.partners`: Approved partner offers (`status IN ('Approved', 'is_example')`).
  - `public.press_articles`: Editorial press releases (`status = 'published'`, `title`, `slug`, `summary`, `content`, `business_name`, `business_address`, `business_phone`, `business_website`, `published_at`).
  - `public.hamper_applications`, `public.hamper_offers`, `public.hamper_coupons`: Welcome Hamper program (public offers & merchant redemption RPCs; applications are private).
  - `public.search_sponsors`, `public.home_gallery`, `public.newsletter_ad_placements`: Sponsored placements (must be visibly badged if ever surfaced, and must never bypass hard user constraints).
  - `public.newsletter_subscribers`: Double opt-in CASL-compliant subscriber list (`status = 'active'`, `wants_monday`, `wants_thursday`); **private** (no anonymous reads).
- **Existing Edge Functions (`supabase/functions/`):**
  - `send-email` (Brevo transport, `wg_email_rate_allow` rate limiting, `STAFF_ONLY_TYPES`, CORS allowlist)
  - `stripe-webhook` (Stripe Payment Links + `stripe_webhook_events` idempotency)
  - `admin-extract-listing` (Anthropic Claude extraction with SSRF/DNS protection)
  - `admin-press-release` (Anthropic Claude drafting with SSRF/DNS protection)
- **Existing Secrets Available in Supabase Edge Functions:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` (already used by `admin-extract-listing` and `admin-press-release`).

---

## 3. Ingestion, Moderation, Deduplication & Expiry Logic

- **Ingestion:** `main.py` + `src/scraper.py` + `src/supabase_client.py` (`sync_scraped_items_to_vendor_events`) crawl tracked sources into `vendor_events` (`status = 'approved'`), plus user/vendor submissions (`/submission` → `pending_verification` → email verify → `pending` → admin approval in `/staff/admin-approvals.html`).
- **Moderation:** Only `status = 'approved'` (`vendor_events`, `directory_listings`) and `status = 'published'` (`press_articles`) are public.
- **Deduplication:** `src/deduplication.py` (`is_fuzzy_duplicate`, threshold `85.0`) + `src/editions.py` (`build_edition_days`) + `20270103_directory_google_place_id.sql` (`google_place_id` unique index on `directory_listings`).
- **Geography & Out of Area:** `site-src/src/utils/communities.js` (`GEORGINA_COMMUNITIES`, `communityFromAddress`) and `src/supabase_client.py` (`_tag_out_of_area_location`) classify Georgina towns/hamlets vs `Out of Area` neighbouring towns.
- **Date & Expiry Rules:** `America/Toronto` local date; `expires_after >= today` (or `event_start_date >= today` / recurring `recurrence_rule` / `date_type = 'multiple'`). News items use `expires_after = pub_date + 366 days`, so news must be **explicitly separated** by `category` (`local_news`, `municipal_news`, `news`, `past_events`, `article`, `press`) so news publication dates are never presented as event dates.

---

## 4. Hosting, Deployment & CI/CD

- **Frontend & PHP Hosting:** ServeByte StackCP (`public_html/wg/`), deployed via `_work/build_production.py` (`wg_production_deploy_YYYY-MM-DD_vXX.X.zip`).
- **Newsletter & Backup Automation:** GitHub Actions (`run_pipeline.yml`, `backup_database.yml`) + ServeByte StackCP Scheduled Task (`trigger_newsletter.php` calling GitHub `workflow_dispatch`).
- **CSP Note (`website/.htaccess`):** `connect-src` will need `https://dtyyptbqbwvwxvtexenr.supabase.co` (already allowed) for `POST /functions/v1/discovery-chat` and `POST /functions/v1/discovery-lead`.

---

## 5. Existing Lead Forms, Newsletter, Hamper & Analytics

- **Lead / Contact Paths:** `/contact` (`Contact.jsx`), `/submission` (`MultiSubmission.jsx`), `/hamper/` (`website/hamper/apply.html`), `/advertise` (`Advertise.jsx`), and `BugReportModal.jsx` (`website/api/send_bug_report.php`).
- **Newsletter:** Double opt-in via `newsletter_subscribers` + `send-email` Edge Function (Brevo). Any newsletter opt-in from **Ask WG** must remain **separate and unchecked by default** (`newsletter_opt_in = false`).
- **Analytics & Privacy:** Google Tag Manager + Microsoft Clarity in `site-src/index.html`; click tracking via `link_clicks` / `wg_record_search_click`. `/privacy` (`Privacy.jsx`) documents no PII selling/trading. **Ask WG** must not send PII into GTM/Clarity events and must not persist full anonymous chat transcripts by default.

---

## 6. Proposed Integration Map & Gate A Decisions

### Proposed Architecture
1. **Database Migration (`supabase/migrations/20270105_ask_wg_discovery.sql`):**
   - `public.discovery_search_view` (read-only SQL view uniting approved `vendor_events`, `directory_listings`, `hamper_offers`, and published `press_articles` with normalized `record_type`, `community`, `is_free`, `price_label`, `starts_at`, `expires_after`, `site_url`, `source_url`, `search_text`).
   - `public.discovery_leads` (private table: RLS `is_admin()` read/update, server-only `service_role` insert; stores `lead_type`, `name`, `email`, `phone`, `business_name`, `message`, `consent_to_contact`, `contact_consent_at`, `newsletter_opt_in`, `newsletter_consent_at`, `source_page`, `status`).
   - `public.discovery_metrics_daily` (privacy-preserving daily aggregates: `metric_date`, `intent`, `community`, `result_count_bucket`, `clicks`, `leads`, `error_count`, `estimated_cost_usd` — zero PII).
   - `public.discovery_rate_limits` (or reuse `wg_email_rate_allow` pattern) for cross-instance Edge Function rate limiting + daily AI budget tracking.
2. **Supabase Edge Functions:**
   - `supabase/functions/discovery-chat/index.ts`: CORS allowlist (`ALLOWED_ORIGINS`), payload & history caps, cross-instance rate limit, deterministic intent + filter parsing (`America/Toronto` dates, Georgina communities, free/price, category), parameterized retrieval from `discovery_search_view`, prompt-injection-safe grounding using `ANTHROPIC_API_KEY` (fast/low-cost model, e.g. `claude-haiku-4-5` or configurable `ASK_WG_MODEL`) with **graceful deterministic fallback** if AI is unavailable or daily budget cap is hit.
   - `supabase/functions/discovery-lead/index.ts`: validates fields + explicit `consent_to_contact === true`, inserts into `discovery_leads`, sends admin notification via `send-email` (or `service_role`), and only enrolls in `newsletter_subscribers` (pending confirmation) if `newsletter_opt_in === true`.
3. **Frontend Widget (`site-src/src/components/AskWgWidget.jsx`):**
   - Lazy-loaded floating **"Ask WG"** button + accessible drawer (`WCAG 2.2 AA`, keyboard Escape/focus management, `prefers-reduced-motion`).
   - Quick actions: *Weekend events*, *Local deals*, *Where to eat*, *New to Georgina*, *Promote my business*.
   - Grounded result cards with title, date/community/price (when known), and `View details` link.

### Decisions Needed for Gate A Approval
1. **AI Provider & Daily Budget Cap:** Confirm using the existing `ANTHROPIC_API_KEY` secret in Supabase with a low-cost model (e.g. Haiku-class) and a hard daily token/request budget (e.g. ~\$0.50–\$1.00 USD/day cap) + deterministic search fallback when capped.
2. **Scope of `Out of Area` results in Ask WG:** Should Ask WG return Georgina-only results by default (and only include `Out of Area` if the user explicitly asks or if Georgina has 0 matches)? *(Recommended: Georgina-only by default, with a clear note if expanding to nearby areas.)*
3. **Lead Notification Email:** Confirm whether `discovery-lead` inquiries should notify `contact@welcomegeorgina.ca` (same as `send-email` admin alerts).
4. **Branching:** Proceed on a dedicated feature branch (e.g. `feat/ask-wg`) or directly on `main`?
