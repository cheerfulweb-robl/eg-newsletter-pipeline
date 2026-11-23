# Local Community & Newsletter Platform — Developer Setup Guide

A full-stack community hub featuring an Event/Dining/Sales Calendar, Business Directory, Twice-Weekly Automated Email Newsletter, Self-Serve Stripe Advertising (Photo Gallery, Newsletter Sponsored, Quick Search), Pressroom with AI Writer + JSON-LD Schema, Newsroom RSS/HTML Crawler, Welcome Hamper Perks, and Disaster Recovery Backups.

---

## 1. Architecture Overview

| Folder | Purpose |
|---|---|
| `site-src/` | React 19 + Vite + Tailwind CSS SPA (public site, discovery, `/advertise`, `/press`, `/newsroom`, `/events`, `/dining`, `/sales`) |
| `website/` | Static HTML/JS admin & staff portals (`/staff/*`, `/hamper/*`, `/business/*`, `/news/*`, `/shared/config.js`) |
| `src/` & `main.py` | Python web crawler, RapidFuzz deduplication, confidence scorer, and Monday/Thursday HTML newsletter compiler |
| `supabase/migrations/` | PostgreSQL schema, RLS policies, RPCs, and storage buckets |
| `supabase/functions/` | Deno Edge Functions (`admin-extract-listing`, `admin-press-release`, `send-email`, `stripe-webhook`) |
| `.github/workflows/` | Automated Monday/Thursday newsletter pipeline (`run_pipeline.yml`) & weekly/on-demand backups (`backup_database.yml`) |

---

## 2. Quick Start Setup (New Municipality / Client Site)

### Step 1 — Create Supabase Project & Run Migrations
1. Create a new project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run the migration files in `supabase/migrations/` in chronological filename order.
3. In **Authentication → URL Configuration**, add your site URL and `https://YOUR_DOMAIN/business/` to **Redirect URLs**.

### Step 2 — Configure Secrets & Deploy Edge Functions
1. Link your project:
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```
2. Set Edge Function secrets in Supabase Dashboard → **Edge Functions → Secrets** (see `.env.example`):
   - `ANTHROPIC_API_KEY` (for AI URL extraction & AI Press Release Writer)
   - `BREVO_API_KEY` (for transactional & newsletter emails)
   - `STRIPE_SECRET_KEY` & `STRIPE_WEBHOOK_SECRET` (for self-serve ad checkout)
   - `ADMIN_ALERT_EMAIL` (receives purchase alerts)
3. Deploy all 4 Edge Functions:
   ```bash
   npx supabase functions deploy admin-extract-listing --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy admin-press-release --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy send-email --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy stripe-webhook --no-verify-jwt --project-ref YOUR_PROJECT_REF
   ```

### Step 3 — Configure Stripe Payment Links & Webhook
1. Create Payment Links in Stripe Dashboard for:
   - Quick Search Sponsored (`weekly`, `monthly`)
   - Photo Gallery Ads (`weekly`, `monthly`)
   - Newsletter Sponsored Ads (`1x`, `4x`)
2. Set **After payment → Redirect customers to your website** to `https://YOUR_DOMAIN/advertise?checkout=success`.
3. Update `site-src/src/config/stripeLinks.js` with your Payment Link URLs.
4. Add a Stripe Webhook pointing to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook` listening to:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.deleted`
5. Copy the webhook **Signing secret** (`whsec_...`) into Supabase `STRIPE_WEBHOOK_SECRET`.

### Step 4 — Configure Frontend & Static Config
1. Copy `site-src/.env.example` to `site-src/.env` and fill in `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DEFAULT_MUNICIPALITY`, and `VITE_OPENWEATHER_API_KEY`.
2. Update `website/shared/config.js` (and sync to `website/staff/assets/config.js` and `website/news/assets/config.js`) with your Supabase URL & anon key.

### Step 5 — Build & Deploy Frontend
```bash
cd site-src
pnpm install --frozen-lockfile
pnpm run build
```
Or use `_work/build_production.py` to generate a single cPanel-ready `.zip` containing the Vite `dist/` bundle plus `website/`.

### Step 6 — Enable GitHub Actions Crawler & Backups
Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` (optional for `pg_dump`), `BREVO_API_KEY`, and `TEST_RECIPIENT` to **GitHub → Settings → Secrets and variables → Actions**.

---

## 3. Running Tests
```bash
# Frontend Vitest suite
cd site-src && npx vitest run

# Python pipeline, navigation, and staff menu tests
python -m unittest tests/test_editions.py tests/test_navigation_order.py tests/test_staff_menu.py tests/test_news_date_fallback.py
```

## 4. Backup & Disaster Recovery Restore
- **On-Demand Data Export:** Signed-in Admins can download a full `.json` snapshot of all 12 core tables from `/staff/backup.html`.
- **Automated Cloud Backups:** `.github/workflows/backup_database.yml` runs weekly (Sundays at 06:00 UTC) and on demand via **Run workflow**, saving `supabase_data_backup.json` (and `supabase_pg_dump.sql.gz` if `SUPABASE_DB_URL` is set) as a 90-day GitHub Actions artifact.
- **Full Restore Procedure:** See [RESTORE_RUNBOOK.md](RESTORE_RUNBOOK.md) for step-by-step instructions on recreating the Supabase schema from `supabase/migrations/`, restoring table data from `.json` or `.sql.gz`, re-deploying Edge Functions & secrets, and re-uploading the cPanel production zip.
