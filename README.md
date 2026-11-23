# Welcome Georgina — Dual Newsletter Pipeline, Vendor Portal & Advertiser Analytics

Unified newsletter and community event platform for **Welcome Georgina** (`welcomegeorgina.ca` + `news.welcomegeorgina.ca`), connected to the shared Welcome Georgina Supabase database (`dtyyptbqbwvwxvtexenr.supabase.co`).

---

## Two Weekly Automated Newsletters

### 1. Community Reader Edition (`--edition reader`)
* **Schedule:** Every **Thursday at 8:00 AM EST** (`0 13 * * 4` UTC)
* **Audience:**
  * Readers who subscribe at `news.welcomegeorgina.ca` (`newsletter_subscribers` where `audience_type IN ('reader', 'both')`).
  * Newcomers who check *"Join the Welcome Georgina Newsletter"* when claiming a Welcome Hamper at `welcomegeorgina.ca/claim` (`claims` table).
* **Contents (`preview.html`):**
  1. **Welcome Georgina • Featured Local Perks & Partner Deals:** Automatically pulled from the live `partners` table (`status IN ('Approved', 'is_example')`) on `welcomegeorgina.ca`.
  2. **Local Journalism & Economic Development:** *The Georgina Post*, *Explore Georgina*, and *Choose Georgina*.
  3. **Town of Georgina Municipal Updates:** Media Releases, Council Highlights, and Town Public Notices.
  4. **Upcoming Community Events:** Town of Georgina Events Calendar, Stephen Leacock Theatre, Georgina Public Library, Georgina Chamber of Commerce, Eventbrite, Meetup, The Briars Resort, Hospice Georgina, and **Approved Small Vendor Events & Auto-Scraped Vendor Websites**.

### 2. Local Vendor & Business Partner Briefing (`--edition vendor`)
* **Schedule:** Every **Monday at 9:00 AM EST** (`0 14 * * 1` UTC)
* **Audience:**
  * Registered business partners in the `partners` table (`welcomegeorgina.ca/partner`).
  * Registered small vendors in `vendor_profiles` (`news.welcomegeorgina.ca/portal.html`).
  * New Businesses in the `claims` table (`user_type = 'New Business'`).
  * Direct Vendor subscribers in `newsletter_subscribers` (`audience_type IN ('vendor', 'both')`).
* **Contents (`preview_vendor.html`):**
  1. **Thursday Issue Submission Reminder:** Direct 1-click buttons to **Submit an Upcoming Event / News Item** or **Connect a Website URL for Weekly Auto-Scraping**.
  2. **Reader Clickthrough & Engagement Highlights:** Live clickthrough stats from `advertiser_click_summary`.
  3. **Sponsorship & Growth Opportunities:** Highlights **Digital Sponsor (\$39/mo)** and **Hamper Sponsor (\$95/mo)** upgrades at `welcomegeorgina.ca/partner`, plus the **Cheerful Media 14-Day Free Google Review Management Trial** (with the \$299 setup fee 100% waived for Welcome Georgina businesses).
  4. **Georgina Business Networking & Economic Updates:** Upcoming Georgina Chamber of Commerce events and Choose Georgina Economic Development news.

---

## Companion Sub-Site & Admin Portal (`docs/` → `news.welcomegeorgina.ca`)

* **[`docs/index.html`](docs/index.html)** — Public Reader & Vendor Newsletter Signup page.
* **[`docs/portal.html`](docs/portal.html)** — Unified Vendor Member Area & Admin Dashboard:
  * Uses the **same Admin login (`cheerfulweb@gmail.com`)** and `user_profiles` table as `welcomegeorgina.ca/admin`.
  * **Tab 1:** Submit a single local event or announcement.
  * **Tab 2:** Submit a vendor website `/events` URL for automatic weekly scraping.
  * **Tab 3:** View submission approval status and reader click counts.
  * **Tab 4 (Admin):** 1-click Approve/Reject for vendor events & scrape URLs, **Advertiser Clickthrough Analytics Report (CSV Export)**, and **Subscriber List (CSV Export)**.
* **[`docs/go.html`](docs/go.html)** — Advertiser & Article Clickthrough Tracker (`link_clicks`).
* **[`docs/unsubscribe.html`](docs/unsubscribe.html)** — 1-click CASL Unsubscribe (updates `newsletter_subscribers`, `partners.join_newsletter`, and `claims.join_newsletter`).
