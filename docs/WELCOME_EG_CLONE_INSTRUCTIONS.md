# Welcome EG: instructions for cloning welcomegeorgina.ca to welcomeeg.ca

Updated: 2026-11-23 (originally written 2026-11-16)
Owner: Robert Lee
Status: **in progress (pre-build organized).** docs/, config/, shared/, and starter deploys/ are in place; DNS & SSL ready on public_html/eg/.

This file is the full plan. A new session should be able to pick it up from here without the earlier conversation.

---

## 1. Goal

Stand up `welcomeeg.ca` as a copy of `welcomegeorgina.ca` that covers East Gwillimbury: same features, its own name, its own database, its own local sources, in as few steps as possible.

| | Georgina (source) | East Gwillimbury (new) |
|---|---|---|
| Domain | welcomegeorgina.ca | welcomeeg.ca |
| Code folder | `C:\Users\robel\WebProjects\welcomegeorgina-redesign` | `C:\Users\robel\WebProjects\welcome-eg` |
| Source commit | `main` at `31d879f` (live is v72.39) | new repo, fresh history |
| Database | Supabase project `dtyyptbqbwvwxvtexenr` | new Supabase project (not yet created) |
| Hosting | ServeByt cPanel, `public_html/eg/` | new folder on the same host (not yet created) |

The architecture, tables and flows are described in the Georgina handover files (`HANDOVER_2026-11-15.md` through `HANDOVER_2026-11-23.md`). Read the latest handover before starting; this file does not repeat it.

---

## 2. Working rules

These are the same rules as the Georgina project and `C:\Users\robel\WebProjects\CLAUDE.md`.

1. The assistant never writes to a live database and never deploys. Database changes are SQL files Robert runs in the Supabase SQL editor.
2. No commit, push, deploy or delete without Robert's explicit "go".
3. Local copies never connect to a production database. Previews use mock data (`vite --mode mock`).
4. The assistant does not sign in or type passwords.
5. Never commit secrets. `.env` files stay out of git.
6. **Do not change anything in the Georgina folders or the Georgina database while doing this work.** The Georgina code is read-only here.
7. No Georgina data is copied: no listings, subscribers, staff accounts or click logs.

---

## 3. Decisions Robert still has to make

Nothing after step 2 can be finished until the first one is answered.

| # | Decision | Recommendation |
|---|---|---|
| 1 | Site name: "Welcome EG" or "Welcome East Gwillimbury"? | None. Needed for the rebrand. |
| 2 | Separate database or share the Georgina one? | **Separate Supabase project.** Sharing means adding a site column to every table and rule, and risks mixing the two sites' subscribers and listings. The rest of this file assumes separate. |
| 3 | Include the Welcome Hamper at launch? | Leave it out at launch. That removes five pages and three tables from testing. It can be switched on later. |
| 4 | Send the Thursday newsletter from day one? | Collect sign-ups first; start sending once there are listings. |
| 5 | Logo, favicon and hero photos for East Gwillimbury | Robert supplies these. |

---

## 4. The steps

Who does each step is marked **[Robert]** or **[Assistant]**.

### Step 1. Accounts and hosting [Robert]

- Point `welcomeeg.ca` at a new folder on the hosting account and turn on SSL.
- Create a new Supabase project. Note its project reference, URL and public (anon) key.
- Add and verify a Brevo sender for the new domain.
- Create a new private GitHub repo.
- Create new Google Tag Manager and Microsoft Clarity IDs, so the two sites' visitor numbers are not mixed.

Give the assistant: the site name, the Supabase URL and public key, the GTM and Clarity IDs, and the sender email address. Do **not** paste the service key or database password into the chat.

### Step 2. Copy the code [Assistant]

Run from `C:\Users\robel\WebProjects\welcome-eg`:

```bash
git -C ../welcomegeorgina-redesign archive main | tar -x -C .
git init -b main
```

Then, before the first commit:

- Remove the Georgina records: `HANDOVER*.md`, `SECURITY_REVIEW_2026-11-15.md`, `supabase/live_snapshot_2026-11-12/`, `supabase/rollback/`, `supabase/checks/reset_crawler_listings_*.sql`, `supabase/checks/delete_approved_before_*.sql`.
- Remove the built Georgina bundle in `website/assets/` (it is rebuilt in step 7).
- Copy `_work/build_production.py` from the Georgina folder. It is not in git, so the archive does not include it.
- `site-src/.env` is also not in git. Create a new one from `site-src/.env.example` with the new project's values.
- Install packages: `npx -y pnpm@10.12.1 install --frozen-lockfile` in `site-src/`.
- Run `vitest run` in `site-src/` to confirm the copy is sound before changing anything. Georgina had 68 passing.

### Step 3. Rebrand [Assistant]

Size of the job, measured on Georgina `main`: "Georgina" appears about 2,100 times in roughly 105 files; `welcomegeorgina.ca` is in 93 files; the Supabase project reference is written into about 12 live files.

Do this as one scripted pass, then read the diff. Files use Windows line endings, some with a byte-order mark; the script must keep both.

**Replace**

| What | Where |
|---|---|
| Site name and visible text ("Welcome Georgina", "Georgina", "Lake Simcoe" copy) | `site-src/src/`, `site-src/index.html`, `site-src/public/`, `website/staff/`, `website/news/`, `website/hamper/`, `website/api/`, `supabase/functions/` (email text), `src/compiler.py` (newsletter text) |
| Domain `welcomegeorgina.ca` | Everywhere, including `sitemap.xml`, `robots.txt`, share-preview tags, email links |
| Supabase project reference and public key | `website/staff/assets/config.js`, `website/staff/ask-wg.html`, `website/news/assets/config.js`, `docs/assets/config.js`, `website/api/page_meta.php`, `website/api/gallery_upload.php`, `website/.htaccess` (CSP), `site-src/src/components/AskWgWidget.jsx`, `site-src/src/config/stripeLinks.js`, `supabase/functions/*/index.ts` (including `discovery-chat`, `discovery-lead`, `discovery-reply`, `admin-press-release`, `stripe-webhook`), `src/supabase_client.py`, `website/staff/special-edition.html`, `supabase/schema.sql` |
| Town list | `site-src/src/utils/communities.js`, `WG_COMMUNITIES` and `wgCommunityFromAddress` in `website/staff/admin-approvals.html`, the list in `website/hamper/index.html`. All three must match. |
| GTM and Clarity IDs | `site-src/index.html` and any static page that loads them |
| Weather location | `site-src/src/services/weatherService.js` |
| Sender address and reply-to | `supabase/functions/send-email/index.ts`, `website/api/send_bug_report.php`, `src/sender.py` |
| Logos, favicon, hero and gallery images | `site-src/public/`, `website/gallery/`, `website/hero/` |
| Privacy and Terms pages | `site-src/src/pages/Privacy.jsx`, `Terms.jsx` (need Robert's review) |

**Leave alone**

- Internal names that visitors never see: database function names starting `wg_`, `window.GEORGINA_CONFIG`, `GEORGINA_COMMUNITIES`, browser storage keys starting `gd_`. Renaming them touches the database and every page for no visible gain. If Robert wants them renamed, do it as a separate pass after launch.
- The CRM. `crm.cheerfulmedia.ca` has no connection to either site.

**Town list for East Gwillimbury** (confirm with Robert): Holland Landing, Mount Albert, Queensville, Sharon, River Drive Park, Holt, Franklin, Brown Hill, plus "Out of Area". Brown Hill sits on the Georgina boundary and is on the Georgina list too.

After the pass: `git grep -i georgina` should return only the internal names listed above. Run the tests again; text assertions in `site-src/tests/` will need the new name.

### Step 4. Database [Robert runs, Assistant prepares]

Use a structure-only export of the Georgina database instead of replaying the migration files. It is one file, and it includes the 11 tables that no migration file creates (`user_profiles`, `directory_listings`, `bug_reports`, `editorial_corrections`, `press_articles`, `newsletter_archive`, `partners`, `coupons`, `wallets`, `claims`, `advertiser_click_summary`).

1. **[Robert]** Export structure only (tables, rules, functions, triggers; no rows) from the Georgina project. With the Supabase CLI: `supabase db dump --schema public -f eg_schema.sql` against the Georgina project. Save the file into `welcome-eg/supabase/`.
2. **[Assistant]** Read the export and confirm it contains no rows and no Georgina-specific values (for example a default sender address or site URL inside a function). Fix any found.
3. **[Robert]** Run the file in the new project's SQL editor.
4. **[Robert]** Create the `hamper-proofs` storage bucket only if the Hamper is included. Storage buckets and sign-in settings are not part of the export.
5. **[Robert]** Create a staff sign-in user in the new project and add its `user_profiles` row with the admin role.
6. **[Robert]** Run `supabase/checks/verify_security_2026-11-15.sql`. Every row should say true.

Not verified: whether any table needs starting rows to work (for example `newsletter_settings`). Check this in step 2 above by reading how the code reads each settings table.

### Step 5. East Gwillimbury sources [Assistant]

The crawler's main sources are written into `src/scraper.py`. Staff-added sources are rows in `vendor_scrape_sources`.

The Georgina sources to replace, as found in `src/scraper.py`: georgina.ca (events calendar and media releases), georginapost.com, exploregeorgina.ca, choosegeorgina.ca, the tixhub box office, georginalibrary.ca, georginachamber.com, Eventbrite (Georgina, Keswick, Jackson's Point, Pefferlaw, Sutton West), Meetup (Keswick), briars.ca, hospicegeorgina.com.

**Candidate East Gwillimbury sources.** These are from memory and have **not been checked**. For each one, confirm the site exists, find its events or news page, and confirm the page can be read by the crawler before adding it.

| Georgina source | East Gwillimbury candidate |
|---|---|
| georgina.ca events and news | Town of East Gwillimbury (eastgwillimbury.ca) events calendar and news |
| Georgina Public Library | East Gwillimbury Public Library (Holland Landing and Mount Albert branches) |
| Georgina Chamber | East Gwillimbury Chamber of Commerce |
| Box office, The Briars | Sharon Temple National Historic Site events |
| Georgina Post | NewmarketToday and yorkregion.com East Gwillimbury coverage |
| Eventbrite and Meetup town searches | Eventbrite and Meetup for Holland Landing, Mount Albert, Sharon, Queensville |
| Hospice Georgina | Local groups such as Mount Albert Lions and the farmers' market (to be confirmed) |

Work to do:

1. Check each candidate and record the working page address.
2. Rewrite the source functions and the source list in `src/scraper.py`. Each Georgina function is written for one site's page layout, so each new site needs its own reading logic, not just a new address.
3. Write a seed file `supabase/migrations/<date>_eg_scrape_sources.sql` for `vendor_scrape_sources`, for Robert to run.
4. Dry run: run the crawler so it writes its results to a local file and **not** to any database. Review the results with Robert: dates present, towns resolved, confidence scores sensible.

### Step 6. Edge functions and secrets [Robert]

- Deploy `send-email`, `stripe-webhook`, `admin-extract-listing`, `admin-press-release`, `discovery-chat`, `discovery-lead`, and `discovery-reply` to the new Supabase project and set their secrets (`BREVO_API_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, plus optional `ASK_WG_MODEL`, `ASK_WG_DAILY_AI_CAP`, and `ASK_WG_LEAD_EMAIL`).
- In the new GitHub repo, set the Actions secrets used by `.github/workflows/run_pipeline.yml`, `.github/workflows/backup_database.yml`, and `.github/workflows/facebook_autopost.yml` (Supabase URL and service key, SMTP account). Leave the Thursday schedule switched off until decision 4 is made; if GitHub `cron` is delayed, configure a StackCP Scheduled Task calling `trigger_newsletter.php` (as documented in `HANDOVER_2026-11-23.md`).
- **Facebook Page Autoposter (3x daily):** Reuse the existing `Welcome Georgina Autoposter` Meta App in Graph API Explorer to generate the **Welcome EG** Page ID and never-expiring Page Access Token. Add `FB_PAGE_ID` and `FB_PAGE_ACCESS_TOKEN` to EG's GitHub Secrets, and set repository variables `SITE_NAME` (`Welcome EG`), `SITE_DOMAIN` (`https://welcomeeg.ca`), and `FB_NOTIFY_EMAIL` (`contact@welcomeeg.ca`).

### Step 7. Test, build, upload

1. **[Assistant]** `vitest run` in `site-src/`; local preview with `npx vite --mode mock`; check desktop, tablet and phone widths.
2. **[Assistant]** Adapt `_work/build_production.py`. The Georgina version packages only files changed since a fixed commit (`LIVE_BASE`). The first East Gwillimbury deploy needs the **whole** `website/` folder plus the fresh build, including `robots.txt` and `sitemap.xml`, which the Georgina script leaves out. Start the version at v1.0.
3. **[Robert]** Upload the zip to the new hosting folder, extract, delete the zip, purge the CDN cache.
4. **[Assistant]** Check from outside, read-only: `http://` redirects to `https://`, the home page loads the new bundle, a staff page loads, an anonymous read of listings returns no contact columns.
5. **[Robert]** Signed-in tests: staff sign-in, add a listing, one public submission through to approval, newsletter sign-up and confirm email.
6. **[Assistant]** Take a snapshot and write the first `HANDOVER_<date>.md` for this project.

---

## 5. What can start without Robert

Steps 2 and 5.1 (checking the candidate sources) need nothing. Step 3 needs only the site name. Everything else waits on step 1.

## 6. Known risks

- **A blind find-and-replace will break things.** "Georgina" is inside internal names that must stay (see step 3). Replace by pattern and read the diff.
- **Shared lists drift.** Towns, sale categories, dining services, phone rules and link cleaning each exist in two places (public site and `admin-approvals.html`). Change both.
- **Source pages differ.** The crawler's reading logic is per site. Expect step 5 to be the largest piece of work.
- **Georgina's open items come along with the copy.** The "Known and not fixed" list in `HANDOVER_2026-11-15.md` section 8 applies to this site too (for example, unsubscribe works by email address without a token).
