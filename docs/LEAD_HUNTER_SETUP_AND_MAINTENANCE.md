# Lead Hunter & Batch Sweep — Installation & Maintenance Guide

This guide explains how to set up, customize, and periodically run **Lead Hunter** (`/staff/lead-hunter.html`) and its **Batch Sweep** system on your community site. It is written for non-developers and site owners.

---

## 1. One-Time Setup (5 Minutes)

### Step 1: Create a Google Places API (New) Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create (or select) a project for your community site.
2. Open **APIs & Services → Library**, search for **Places API (New)**, and click **Enable**.
3. Open **APIs & Services → Credentials → Create Credentials → API Key**.
4. Click the new key to **Restrict** it:
   - **Application restrictions:** Choose **IP addresses** and enter your web server's public IP address (never use HTTP referrers, because this key is used server-side by PHP).
   - **API restrictions:** Choose **Restrict key** and select **Places API (New)** only.
5. Save the key.

### Step 2: Add the Server Config File (`api/lead_hunter_config.php`)
1. On your web host (in `public_html/<your-folder>/api/`), copy `api/lead_hunter_config.example.php` to `api/lead_hunter_config.php`.
2. Open `api/lead_hunter_config.php` and paste your Google Places API key:
   ```php
   <?php
   return [
       'google_places_key' => 'PASTE_YOUR_RESTRICTED_KEY_HERE',
   ];
   ```
3. **Security note:** Never commit `api/lead_hunter_config.php` to Git. The included `.htaccess` also blocks direct browser access to it.

### Step 3: Verify `.htaccess` Origin & Auth Rules
- In `website/api/lead_hunter.php`, ensure `$allowed_origins` includes your live domain (`https://yourdomain.ca` and `https://www.yourdomain.ca`).
- Ensure `website/.htaccess` includes `RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]` so your admin login token reaches PHP.

---

## 2. Setting Up a New Regional Area / City & Customizing Presets

### Option A: In the Admin UI (or via AI Seeding into Supabase)
1. Sign in as an **Admin** or **Super Admin** and open **`/staff/lead-hunter.html`**.
2. Click the **⚡ Batch Sweep (Auto-Collect & Dedupe)** tab.
3. Update the two preset boxes for your city/region:
   - **Pre-Defined Plazas / Streets:** Enter one plaza, main street, or crossroads per line (e.g., `123 Main St, YourTown`).
   - **Pre-Defined Sub-Categories:** Enter one business type per line (e.g., `bakery`, `coffee shop`, `florist`, `auto repair`).
4. Choose your **Sub-Category Search Community** (usually `All ...`) and **Plaza Search Radius** (`400m` is ideal for plazas).
5. **Shared Across All Admins:** Presets and sweep timestamps are automatically saved to Supabase (`public.newsletter_settings` under `setting_key = 'lead_hunter_sweep_config'`) as well as `localStorage`. When setting up a brand-new city, an AI assistant can also seed `lead_hunter_sweep_config` directly with your region's initial plazas and sub-categories.
6. **Adding Newly Discovered Areas Later:** When searching a new plaza or street on the **📍 Neighbourhood / Plaza / Address Search** tab, click **➕ Save Area to Batch Sweep** to add it to your shared Batch Sweep list in one click.

### Option B: Updating Built-In Regional Defaults (New City Clone)
When cloning the Community Package for a new municipality, update these four arrays in `website/staff/lead-hunter.html`:
- `COMMUNITIES`: Your town/city's neighbourhoods, villages, or wards.
- `OUT_OF_AREA_TOWNS`: Neighbouring municipalities outside your coverage area (used to auto-uncheck out-of-area results).
- `DEFAULT_SWEEP_PLAZAS`: Default commercial plazas, main streets, and crossroads for **Reset Presets**.
- `DEFAULT_SWEEP_SUBCATS`: Default business categories for Batch Sweep.

---

## 3. Running Periodic Batch Sweeps & Setting Reminders

- **Reminder Banner:** At the top of `/staff/lead-hunter.html`, a reminder banner tracks when you last ran a Batch Sweep and alerts you when a new sweep is due.
- **Recommended Schedule:** Set **Sweep Reminder Interval** to **Every 30 days** (or 14 / 60 / 90 days depending on how fast businesses open in your town). You can also click **Snooze 7 Days** if you want to defer a sweep.
- **Running a Sweep:**
  1. Open the **⚡ Batch Sweep** tab and click **Run Full Batch Sweep**.
  2. Lead Hunter automatically pauses **2.5 seconds** between searches to stay well under the server's rate limit (60 requests per 10 minutes). You can click **Stop Sweep** at any time.
  3. **Duplicates Set Aside:** Businesses already in your directory (same name & street address) or repeated across multiple searches are automatically moved into the collapsible **Duplicates Set Aside** panel so they never clutter your review queue.
  4. **Chains & Out-of-Area:** Known national chains and neighbouring-town results are automatically unchecked.
  5. **Pending Approval Only:** Whether you click **Push Selected to Pending** manually or check **Auto-push clean new leads to Pending Approval**, imported businesses **always** land in **Pending Approval** on `/staff/businesses.html`—never published live automatically.

---

## 4. Reviewing & Approving Imported Businesses

1. Open **`/staff/businesses.html?filter=pending`**.
2. For each pending business:
   - Click **Approve** to publish it to the live directory, or
   - Click **Edit** to add/clean its description, website, or upload a cleared photo, or
   - Leave it in **Pending** for follow-up later.
3. **Copyright Rule:** Lead Hunter never imports Google Places photos. New listings use `/placeholder-eg-500x500.png` until you or the business owner uploads an authorized photo.
