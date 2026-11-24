# Welcome Georgina Parity Port Guide (from Welcome EG `v1.8`–`v1.14`)

Date: 2026-11-24  
Source reference (read-only from Georgina session): `C:\Users\robel\WebProjects\welcome-eg` (`main` at `56feb43`)  
Target repo: `C:\Users\robel\WebProjects\welcomegeorgina-redesign` (current `v72.40` → next **`v72.41`**)

> **Scope:** Port only the shared feature, UI, mobile, and staff-tool improvements below into `welcomegeorgina-redesign`. **Do NOT port** East Gwillimbury-specific customizations (EG communities, EG Lead Hunter plazas/out-of-area list, `placeholder-eg-500x500.png`, `welcome-eg-logo.svg`, `SITE_NAME=Welcome EG`, or `src/scraper.py` EG calendar logic).

---

## 1. Recurring Event Schedule Display (`site-src/src/services/discoveryService.js`)
- In `formatEventScheduleDisplay(event)`: when an event is recurring (`date_type === 'recurring'` or schedule labels like `Every Tuesday`), **do not** append `expires_after` to the displayed schedule string.
- Reference in `welcome-eg`: `site-src/src/services/discoveryService.js`.

## 2. Tablet `Clear` Buttons on End Dates (`website/staff/admin-approvals.html`)
- Add one-tap **Clear** buttons next to **Ends On (opt)** (`data-clearsf="recEnd"`) and **Expires Date** (`#edit-ev-expires`) so tablet/iPad users can clear end dates in one tap.

## 3. Extended Mobile Viewport & Text-Wrapping Lockdown
Beyond `v72.40` (`EventDetails.jsx` + `index.css` grid/flex `min-width: 0`), port these additional locks from `welcome-eg`:
- **`site-src/src/index.css`:**
  - Add `strong, button, label` to `p, li, td, a, span, h1, h2, h3, h4 { overflow-wrap: break-word; }`.
  - Add `main .flex > *` to `max-width: 100%;` alongside `main .grid > *, main img, main svg, main table`.
  - Include `main span[class*="rounded-xl"][class*="px-"], main span[class*="rounded-lg"][class*="px-"]` in the `main` badge-wrapping rule (`white-space: normal; flex-shrink: 1; overflow-wrap: break-word; max-width: 100%;`).
- **`site-src/src/pages/DiningDetails.jsx`:**
  - Add `w-full min-w-0` to the outer `max-w-[1440px]` wrapper.
  - Breadcrumb `<nav>`: use `flex-wrap min-w-0 max-w-full`, `shrink-0` on links/icons, and replace `truncate max-w-[200px]` with `min-w-0 max-w-full break-words`.
  - `<h1>`: add `break-words`.
- **`site-src/src/pages/PressArticle.jsx`:**
  - Add `min-w-0` to the outer `max-w-[1440px]` wrapper.
  - Breadcrumb `<nav>`: use `flex-wrap min-w-0 max-w-full`, `shrink-0` on links/separators, and replace `truncate max-w-xs` with `min-w-0 max-w-full break-words`.
  - `<h1>`: add `break-words`.
- **`site-src/src/pages/EventsCalendar.jsx` (14-day view card badge):**
  - Replace `whitespace-nowrap` on the 14-day card category badge `<span>` with `max-w-full whitespace-normal break-words text-left leading-tight` so long badges (e.g. `COMMUNITY GATHERING & SOCIAL • WEEKLY`) wrap instead of clipping.

## 4. Staff Businesses Manager Upgrades (`website/staff/businesses.html`)
Port directly from `C:\Users\robel\WebProjects\welcome-eg\website\staff\businesses.html` (keeping Georgina community defaults):
1. **Category `<select>` Dropdown:**
   - Replace `<input type="text" id="edit-biz-category" list="biz-category-list">` + `<datalist>` with `<select id="edit-biz-category" class="form-control"></select>`.
   - Populate `#edit-biz-category` in `populateCategoryDatalist(businesses)` with all standard + existing DB categories sorted alphabetically, and preserve any custom DB category in `openBusinessModal()`.
2. **Bulk Checkboxes + Approve / Reject / Delete:**
   - Add `#biz-select-all` in the Directory Listings table header and `.biz-row-chk` checkboxes in each row (only on the Directory Listings table — **not** the Pending Claims table).
   - Add `#biz-bulk-bar` in the card header showing `<span id="biz-selected-count">0</span> selected` + **Approve**, **Reject**, and **Delete** buttons (`bulkUpdateBizStatus`, `bulkDeleteBiz`).
   - Add per-row **Approve**, **Reject**, and **Delete** buttons (`quickSetBizStatus`, `deleteSingleBiz`).

## 5. Footer Transparent Logo Check (`site-src/src/components/Footer.jsx` & static HTML)
- Verify the footer logo (`className="h-9 w-auto brightness-0 invert"`) points to a **transparent** SVG/PNG asset (e.g. `welcome-georgina-logo.svg` or transparent PNG), never an opaque-background image (which `brightness-0 invert` turns into a solid white rectangle). Keep exact header/footer logo dimensions unchanged.

## 6. Process Rules to Keep Aligned
- **Always increment deploy zip version:** Bump `VERSION` in `_work/build_production.py` (`v72.41`, `v72.42`, ...) before every rebuild — never overwrite/reuse an existing version.
- **Verify:** Run `vitest run` in `site-src/`, `pytest` on Python tests, and package `_work/wg_production_deploy_2026-11-24_v72.41.zip`.
