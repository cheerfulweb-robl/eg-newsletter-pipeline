# Welcome Community Platform — Modularization & Scraper Enrichment Project Plan

**Date:** 2026-11-24  
**Owner:** Robert Lee  
**Sites:** `welcomegeorgina.ca` (`welcomegeorgina-redesign`) & `welcomeeg.ca` (`welcome-eg`)  
**Budget:** \$0 extra infrastructure/software cost  
**Working Rule:** Upgrade **in place** — both live sites remain online throughout; every stage produces a tested, incremented deploy zip.

---

## Stage 0 — Achieve 100% Feature Parity (`welcomegeorgina.ca` `v72.41`)

Before modularizing, bring `welcomegeorgina.ca` to exact feature parity with `welcomeeg.ca` (`v1.19`), excluding EG-only customizations.

- **Reference Guide:** `C:\Users\robel\WebProjects\welcome-eg\docs\WELCOME_GEORGINA_PARITY_PORT_2026-11-24.md`
- **Checklist:**
  - [ ] Hide `expires_after` on recurring weekly/monthly events (`site-src/src/services/discoveryService.js`)
  - [ ] Add tablet `Clear` buttons on `Ends On (opt)` & `Expires Date` (`website/staff/admin-approvals.html`)
  - [ ] Port extended mobile viewport/text-wrapping locks (`index.css`, `DiningDetails.jsx`, `PressArticle.jsx`, `EventsCalendar.jsx` 14-day badge wrapping)
  - [ ] Port Business Category `<select>` dropdown + bulk checkboxes/Approve/Reject/Delete (`website/staff/businesses.html`)
  - [ ] Verify transparent footer logo (`Footer.jsx`) + Ask WEG/WG Footer button & static-page widget (`shared/config.js`)
  - [ ] Verify `vitest run`, `pytest`, and package `wg_production_deploy_2026-11-24_v72.41.zip`

---

## Stage 1 — Modularize `welcomegeorgina.ca` First (Phases 1–3, ~4–4.5 Hours)

Update `welcomegeorgina-redesign` in place as the **master modular template**.

### Phase 1: Route-Level Code Splitting (~30–45 min)
- **Target:** `site-src/src/App.jsx`
- **Change:** Convert ~70 static route imports to `React.lazy()` + `<Suspense>` fallback.
- **Outcome:** Initial mobile JS bundle drops from **`1,421 kB`** (`~383 kB` gzip) to **`~200 kB`**, cutting mobile load time dramatically.
- **Verify:** `npx vitest run` + `npx vite build` + click-through on `/`, `/events`, `/directory`, `/dining`.

### Phase 2: Single Town Config (`site.config.json`) (~2–3 hours)
- **Target:** New root `site.config.json` consumed by React (`site-src/src/config/siteConfig.js`), `website/staff/lead-hunter.html`, `website/api/lead_hunter.php`, and `supabase/functions/discovery-chat/index.ts`.
- **Fields in `site.config.json`:**
  - `siteName`, `domain`, `municipality`, `region`, `contactEmail`, `ga4Id`
  - `geo` (`lat`, `lng`, `radiusMeters`)
  - `communities[]`, `outOfAreaTowns[]`, `sweepPlazas[]`
  - `brand` (`logoSvg`, `watermarkPng`, `placeholderPng`, `ogImageJpg`)
- **Outcome:** **Zero hardcoded town names, coordinates, or asset filenames** in shared UI/API code.

### Phase 3: Unified Database Bootstrap (`000_init_town.sql`) (~1 hour)
- **Target:** `supabase/migrations/000_init_town.sql`
- **Change:** Consolidate base schema, `20270104–20270107` migrations, and all `service_role` / `anon` / `authenticated` `GRANT`s (`001`–`004` equivalents) into one idempotent SQL file.
- **Outcome:** Any new town's Supabase project works on the first run (no `403 permission denied` errors on Lead Hunter, Facebook Autoposter, or Ask Assistant).

---

## Stage 2 — Mirror Modular Core to `welcomeeg.ca` (~35–45 Minutes)

Once Phases 1–3 are tested and deployed on `welcomegeorgina.ca`:
1. Copy the modularized shared files (`App.jsx`, `siteConfig.js`, `lead-hunter.html`, `lead_hunter.php`, `discovery-chat`, etc.) into `C:\Users\robel\WebProjects\welcome-eg`.
2. Keep East Gwillimbury's own `site.config.json`, `site-src/.env`, `images/` (`welcome-eg-logo.svg`, `watermark-500x500.png`, `placeholder-eg-500x500.png`), and `src/scraper.py` EG calendar logic.
3. Run `vitest run`, `pytest`, build the next incremented `welcomeeg_production_deploy_*.zip`, and deploy.

---

## Stage 3 — Secondary Module: Scraper Image & Text Processing (`src/enrichment/`)

A dedicated Python post-processing module that upgrades raw scraped data before syncing to `vendor_events` and `directory_listings`. Works identically for both Georgina and East Gwillimbury (driven by `site.config.json` + env vars).

### Module A: Text Processing & Normalization (`src/enrichment/text_processor.py`)
- **Structured Extraction:** Parses `application/ld+json` (`schema.org/Event`, `LocalBusiness`), OpenGraph/Twitter meta tags, and `<time>` elements from scraped pages before falling back to HTML body text.
- **Field Cleanup & Normalization:**
  - Strips HTML entities, navigation clutter, and boilerplate phrases.
  - Normalizes dates/times to `America/Toronto` (`event_start_date`, `expires_after`, `recurrence_rule`), ensuring single-day events set `expires_after = event_start_date`.
  - Extracts and formats Canadian phone numbers `(905) xxx-xxxx`, street addresses, and postal codes.
  - Generates clean 1–2 sentence summaries (`<= 220` chars) for cards, newsletters, and Facebook posts.
- **Smart Classification & Deduplication:**
  - Auto-maps categories (`community_events`, `dining`, `retail_sale`, `arts_culture`, `sports_rec`) and flags `Out of Area` locations automatically.
  - Uses `RapidFuzz` (already installed in `.venv`) to merge near-duplicate scraped events (same venue + date + fuzzy title `>= 88%`).

### Module B: Image Processing & Storage (`src/enrichment/image_processor.py`)
- **Copyright-Safe Sourcing:** Extracts only authorized event/business `og:image` or `schema.org` images from scraped municipal/partner pages (never imports Google Places photos).
- **Validation & Filtering (Pillow):**
  - Verifies `HTTP 200` and valid image MIME (`image/jpeg`, `image/png`, `image/webp`).
  - Rejects broken links, SVGs/tracking pixels, and tiny icons (`< 200x200 px`).
- **Optimization & Branding:**
  - Resizes oversized images (max `1200px` width) and compresses to optimized JPEG/WebP (`~60–120 KB`) for fast mobile loading.
  - Optionally stamps the town watermark (`brand.watermarkPng` from `site.config.json`) or falls back to `brand.placeholderPng` when no valid image exists.
- **Self-Hosted Caching:** Uploads processed images to Supabase Storage (`event-images` bucket) so external source URLs never break (`404`/`403`) on live cards or social previews.

### Integration & Verification
1. Wire `text_processor` and `image_processor` into `src/scraper.py` (`aggregate_content()`) behind a clean toggle (`ENABLE_ENRICHMENT=true`).
2. Add unit tests (`tests/test_enrichment.py`) covering JSON-LD parsing, date normalization, fuzzy dedup, and image validation/resizing.
3. Run `.venv/Scripts/python.exe main.py --dry-run` on both repos to verify cleaner titles, summaries, venues, and cached images before turning on live.

---

## Summary Timeline

| Stage | Scope | Estimated Time | Cost |
|---|---|---|---|
| **Stage 0** | `welcomegeorgina.ca` `v72.41` parity | ~30–45 min | \$0 |
| **Stage 1** | Modularize `welcomegeorgina.ca` (Phases 1–3) | ~4–4.5 hours | \$0 |
| **Stage 2** | Mirror modular core to `welcomeeg.ca` | ~35–45 min | \$0 |
| **Stage 3** | Scraper Text & Image Processing Module | ~3–4 hours | \$0 |
| **Total** | **Full parity + modular core + enrichment** | **~8–9.5 hours** | **\$0** |
