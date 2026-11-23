# Shared Files Manifest (welcomegeorgina.ca <-> welcomeeg.ca)

All codebase files shared between both domains live in:
`C:\Users\robel\WebProjects\welcomegeorgina-redesign` (canonical repo, branch `main`).

Going forward, any file shared between `welcomegeorgina.ca` and `welcomeeg.ca` must remain clearly named and tracked here so both sites stay in sync.

| Role | Canonical Path in `welcomegeorgina-redesign` | Notes |
|---|---|---|
| Production build script | `_work/build_production.py` | Next step: add `--site wg\|eg` + `sites/georgina.json` + `sites/eg.json` |
| React staff menu (single source) | `site-src/src/utils/staffMenu.js` | Must stay identical to `WG_STAFF_MENU` in `website/shared/config.js` |
| React navbar & mobile/desktop menus | `site-src/src/components/Navbar.jsx` | Uses `staffMenuFor()` |
| Static portals config & staff menu | `website/shared/config.js` | Synced identically to `website/staff/assets/config.js` & `website/news/assets/config.js` |
| Static portals shared stylesheet | `website/staff/assets/styles.css` | Shared across `/staff/`, `/news/`, `/hamper/`, `/business/` |
| SSR Open Graph & LocalBusiness JSON-LD | `website/api/page_meta.php` | Reads site domain/name from config |
| 1-click sitemap generator | `website/api/regenerate_sitemap.php` | Generates `sitemap.xml` on server |
| Apache routing & cache rules | `website/.htaccess` | Shared SPA + SSR meta rewrite rules |
| Supabase schema & migrations | `supabase/migrations/` | Applied to each site's Supabase project |
| Sellable template packager | `scripts/package_template.py` | Outputs `community_package/community_platform_template_YYYY-MM-DD.zip` |
| Business claim modal (React) | site-src/src/components/ClaimBusinessModal.jsx | Used on /directory & /businesses/<slug>; requires 20270101_business_claims.sql + send-email |
| Directory & Business Claims admin | website/staff/businesses.html | CSV import, Missing Description filter, Business Claims queue |
| Lead Hunter novice setup guide | docs/LEAD_HUNTER_SETUP_AND_MAINTENANCE.md | Novice-ready install & Batch Sweep maintenance guide (also packaged in `community_package/`) |
| Lead Hunter admin UI & PHP proxy | website/staff/lead-hunter.html & website/api/lead_hunter.php | Server-only pi/lead_hunter_config.php holds each site's Google Places key |
