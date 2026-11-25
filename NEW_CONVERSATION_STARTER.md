# Welcome Georgina & Welcome EG — Tomorrow's Pickup Guide (2026-11-24)

Use this guide when you open your **`welcomegeorgina.ca`** session (`C:\Users\robel\WebProjects\welcomegeorgina-redesign`) tomorrow.

---

### Exact Order of Steps Tomorrow

1. **Open a new chat in `C:\Users\robel\WebProjects\welcomegeorgina-redesign`** and paste the prompt below.
2. **Stage 0 — Parity (`v72.41`):** Apply all shared fixes from `WELCOME_GEORGINA_PARITY_PORT_2026-11-24.md` so `welcomegeorgina.ca` matches `welcomeeg.ca`.
3. **Stage 1 — Site Architecture Upgrades (`welcomegeorgina.ca` first):**
   - Add `React.lazy()` route splitting in `App.jsx` (`1.42 MB` → `~200 KB` initial load).
   - Extract `site.config.json` (town name, communities, geo, plazas, GA4, logos/watermarks).
   - Create `000_init_town.sql` (unified DB schema + RLS + `service_role` grants).
4. **Stage 3 — Text Recognition, Extraction & Image Processing (`src/enrichment/`):**
   - Build `text_processor.py` (JSON-LD / OpenGraph / `<time>` extraction, boilerplate cleanup, date/recurrence normalization, `RapidFuzz` dedup) and `image_processor.py` (copyright-safe `og:image`, Pillow validation/compression, watermark/placeholder fallback, Supabase Storage caching).
5. **Stage 2 — Mirror back to `welcomeeg.ca`:** Once tested and deployed on `welcomegeorgina.ca`, copy the modular core into `welcome-eg` (keeping EG's `site.config.json`, `.env`, `images/`, and EG scraper).

---

### Copy & Paste Prompt for Tomorrow's `welcomegeorgina.ca` Chat

```text
Please read:
1. C:\Users\robel\WebProjects\welcomegeorgina-redesign\HANDOVER_2026-11-24.md
2. C:\Users\robel\WebProjects\welcome-eg\docs\WELCOME_GEORGINA_PARITY_PORT_2026-11-24.md
3. C:\Users\robel\WebProjects\welcome-eg\docs\PLATFORM_MODULARIZATION_PROJECT_PLAN.md

Today's goal on welcomegeorgina.ca (starting from v72.40, main at e6eb761):
1. First bring welcomegeorgina.ca to 100% parity with welcomeeg.ca (v72.41) per WELCOME_GEORGINA_PARITY_PORT_2026-11-24.md (excluding EG-only customizations).
2. Then execute the site architecture upgrades (React.lazy() route splitting, single site.config.json, and 000_init_town.sql) plus the secondary scraper text recognition/extraction and image processing module (src/enrichment/) per PLATFORM_MODULARIZATION_PROJECT_PLAN.md.

Do not make unrequested cosmetic changes, and do not modify welcome-eg in this session. Confirm you have read all three files and present your Stage 0 (v72.41) plan for my approval.
```
