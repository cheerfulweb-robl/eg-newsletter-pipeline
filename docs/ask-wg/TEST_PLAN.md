# Ask WG — Test Plan

## Automated Checks
- `py -m unittest tests.test_ask_wg`: verifies migration objects, `service_role`-only grants on `discovery_search_view`, `wg_block_viewer_writes` on `discovery_leads`, CORS allowlist + prompt-injection rules in `discovery-chat`, consent enforcement in `discovery-lead`, and `AskWgWidget` mount in `App.jsx`.
- `vite build` in `site-src/`: verifies clean bundle and lazy chunk splitting for `AskWgWidget`.

## Live Staging Smoke Tests (Gate B–D)
1. **Dates & Geography:** `"What's happening in Keswick this Saturday?"` and `"Free things for kids this weekend"` return only approved future Georgina listings; past/expired items are excluded.
2. **Dining & Offers:** `"Where can we eat near Jackson's Point?"` and `"Any deals on dining in Sutton?"` return matching `dining`/`offer`/`business` records.
3. **Out of Area Fallback:** Georgina-specific query with 0 matches does not leak unrelated `Out of Area` items; broad query with 0 Georgina matches clearly labels `Out of Area` fallback.
4. **News Separation:** `"What's new in local news?"` labels news dates as publication dates.
5. **Lead Consent:** Submitting without `consent_to_contact` fails (400); submitting with consent inserts into `discovery_leads` and emails `contact@welcomegeorgina.ca`; `anon` cannot `SELECT` from `discovery_leads`.
6. **Budget & Fallback:** Setting `ASK_WG_DAILY_AI_CAP=0` triggers deterministic search summary without errors.
