# Ask WG — Architecture

- **Frontend Widget (`site-src/src/components/AskWgWidget.jsx`):** Lazy-loaded in `site-src/src/App.jsx` alongside `<BugReportModal />`. Anonymous by default, WCAG 2.2 AA accessible (`role="dialog"`, `Escape` close, focus return, `motion-reduce`), plain React text rendering (no raw HTML injection), and an optional consented inquiry form.
- **Database (`supabase/migrations/20270105_ask_wg_discovery.sql`):**
  - `public.discovery_search_view` (`service_role` only): normalizes approved `vendor_events`, `directory_listings`, active `hamper_offers`, and published `press_articles`, filtering expired events using `America/Toronto` dates and tagging `is_out_of_area`.
  - `public.discovery_leads`: private table (`is_admin()` read/update, `wg_block_viewer_writes` trigger, `service_role` insert) recording explicit contact consent and optional separate newsletter opt-in.
  - `public.discovery_metrics_daily`: aggregate daily metrics with zero PII.
  - `public.discovery_rate_limits` + `wg_discovery_rate_allow`: cross-instance hourly IP rate limit + daily AI request cap.
- **Edge Functions:**
  - `supabase/functions/discovery-chat/index.ts`: CORS allowlist (`ALLOWED_ORIGINS`), SHA-256 hashed IP rate limit, deterministic `America/Toronto` date/community/intent parsing, Georgina-first retrieval with `Out of Area` fallback only on 0 Georgina matches, Anthropic Haiku grounding (`ASK_WG_MODEL`, default `claude-haiku-4-5-20251001`) with prompt-injection boundaries and deterministic fallback when AI is unavailable or daily budget cap is reached.
  - `supabase/functions/discovery-lead/index.ts`: honeypot + rate-limit + consent validation, persists to `discovery_leads`, and notifies `contact@welcomegeorgina.ca` via `send-email`.
