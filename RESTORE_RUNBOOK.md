# Disaster Recovery & Cloud Backup Runbook

This guide explains how your cloud backups work and gives step-by-step recovery playbooks for all four disaster scenarios:
1. **Site Gets Hacked**
2. **Database Altered or Corrupted**
3. **Moving to a New Computer**
4. **Moving to a New Host / Server**

---

## 1. Where Your Cloud Backups Live

1. **Source Code, SQL Migrations, Edge Functions & Workflows:**
   - GitHub private repository (`main` branch).
2. **Automated Weekly & On-Demand Full Cloud Backups:**
   - GitHub → **Actions** → **Cloud Disaster Recovery Backup (On-Demand + Weekly)** (`backup_database.yml`).
   - Runs automatically every Sunday at 06:00 UTC (and anytime you click **Run workflow**).
   - Each `wg-backup-*` artifact (retained 90 days) contains:
     - `supabase_data_backup.json` — full JSON export of all 26 tables
     - `supabase_storage_backup.tar.gz` — all uploaded files from Supabase Storage buckets (`gallery`, `claim-proofs`, `hamper-proofs`, etc.)
     - `supabase_pg_dump.sql.gz` — full Postgres SQL dump (when `SUPABASE_DB_URL` secret is set)
     - `repo_snapshot.tar.gz` — clean copy of repository code & migrations
   - **Optional Second Cloud (S3 / Cloudflare R2 / Backblaze B2):** Set `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, and (for R2/B2) `BACKUP_S3_ENDPOINT` in GitHub Repository Secrets to mirror every backup off-site automatically.
3. **On-Demand Admin JSON Snapshot:**
   - Admin Panel → **Reports & Tools** → **Full Backup & Recovery** (`/staff/backup.html`) → **Download Full Site Data Backup (.json)**.
4. **Secrets Vault (Keep in a Password Manager — Never in Git):**
   - `site-src/.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DEFAULT_MUNICIPALITY`, `VITE_OPENWEATHER_API_KEY`)
   - `api/lead_hunter_config.php` (Google Places API New key)
   - Supabase `service_role` key & `SUPABASE_DB_URL`
   - Edge Function secrets (`ANTHROPIC_API_KEY`, `BREVO_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)

---

## 2. Recovery Playbooks

### Scenario 1: Site Gets Hacked (Web Files Defaced or Compromised)
1. **Take the compromised folder offline / wipe it:** In cPanel File Manager, rename or delete the contents of `public_html/wg/` (save `api/lead_hunter_config.php` only if uncompromised; better yet, regenerate the Google Places key).
2. **Rotate all exposed credentials:**
   - Rotate Google Places API key in Google Cloud Console and update `api/lead_hunter_config.php`.
   - If server/Supabase keys were exposed, rotate `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`, `STRIPE_SECRET_KEY`, and `ANTHROPIC_API_KEY`.
   - Check Supabase `user_profiles` and `auth.users` for any unauthorized admin accounts and deactivate/delete them.
3. **Rebuild and redeploy clean files from Git:**
   ```bash
   git checkout main && git pull
   python _work/build_production.py
   ```
   Upload the fresh `_work/wg_production_deploy_<DATE>_<VERSION>.zip` to `public_html/wg/`, extract, and delete the `.zip`.
4. **Purge CDN cache** and run `/staff/businesses.html` → **Regenerate sitemap.xml**.

---

### Scenario 2: Database Altered or Corrupted
1. Download the latest clean `wg-backup-*` artifact from **GitHub → Actions → Cloud Disaster Recovery Backup** (or your S3/R2/B2 bucket).
2. **Option A — Full SQL Restore (`supabase_pg_dump.sql.gz`):**
   ```bash
   gunzip supabase_pg_dump.sql.gz
   psql "$SUPABASE_DB_URL" -f supabase_pg_dump.sql
   ```
3. **Option B — Selective or Full JSON Restore (`supabase_data_backup.json`):**
   ```bash
   # Preview first (dry-run):
   py scripts/restore_from_backup.py path/to/supabase_data_backup.json
   # Apply to database (or add --tables directory_listings vendor_events):
   set SUPABASE_URL=https://YOUR_REF.supabase.co
   set SUPABASE_SERVICE_KEY=your_service_role_key
   py scripts/restore_from_backup.py path/to/supabase_data_backup.json --apply
   ```
4. **Restore Storage Files (if needed):** Extract `supabase_storage_backup.tar.gz` and re-upload files to the matching Supabase Storage buckets (`gallery`, `claim-proofs`, `hamper-proofs`).

---

### Scenario 3: Moving Files to a New Computer
1. Install **Git**, **Node.js (LTS) + pnpm**, **Python 3.12+**, and **Supabase CLI**.
2. Clone the repository:
   ```bash
   git clone https://github.com/<your-org>/<your-repo>.git
   cd <your-repo>
   ```
3. Restore `site-src/.env` from your password manager.
4. Install frontend dependencies and verify the build:
   ```bash
   cd site-src
   pnpm install --frozen-lockfile
   pnpm exec vite build
   ```
5. You are immediately ready to edit, build deploy zips (`py _work/build_production.py`), and package templates (`py scripts/package_template.py`).

---

### Scenario 4: Moving to a New Web Host / Server (or Fresh Supabase Project)
1. **If moving web hosts only (keeping existing Supabase):**
   - Point your domain DNS and SSL to the new host's document root (e.g., `public_html/wg/`).
   - Run `py _work/build_production.py`, upload the deploy zip, extract, and delete the `.zip`.
   - Recreate `api/lead_hunter_config.php` with your Google Places key, and update the **IP restriction** in Google Cloud Console to your new server's IP address.
   - Place `robots.txt` and regenerate `sitemap.xml` via `/staff/businesses.html`.
2. **If moving to a brand-new Supabase project as well:**
   - Run all SQL files in `supabase/migrations/` in chronological filename order in the new project's SQL Editor.
   - Restore data using `supabase_pg_dump.sql.gz` or `scripts/restore_from_backup.py --apply`, and re-upload `supabase_storage_backup.tar.gz`.
   - Set Edge Function secrets (`ANTHROPIC_API_KEY`, `BREVO_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) and deploy all 4 functions:
     ```bash
     npx supabase functions deploy admin-extract-listing --project-ref <PROJECT_REF>
     npx supabase functions deploy admin-press-release --project-ref <PROJECT_REF>
     npx supabase functions deploy send-email --project-ref <PROJECT_REF>
     npx supabase functions deploy stripe-webhook --project-ref <PROJECT_REF>
     ```
   - Update Supabase **Authentication → URL Configuration** (`Site URL` + `https://<domain>/business/` redirect URL), update `site-src/.env`, `website/shared/config.js`, `website/api/page_meta.php`, `website/api/lead_hunter.php`, `website/api/regenerate_sitemap.php`, `website/api/gallery_upload.php`, rebuild, and upload.
