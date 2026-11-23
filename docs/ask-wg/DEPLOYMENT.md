# Ask WG — Deployment & Rollback

## Environment Variables (Supabase Edge Function Secrets — Names Only)
- `SUPABASE_URL` (auto-injected)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-injected)
- `ANTHROPIC_API_KEY` (already configured)
- Optional: `ASK_WG_MODEL` (default `claude-haiku-4-5-20251001`), `ASK_WG_DAILY_AI_CAP` (default `400`), `ASK_WG_HOURLY_IP_CAP` (default `40`), `ASK_WG_LEAD_EMAIL` (default `contact@welcomegeorgina.ca`), `ASK_WG_IP_SALT`

## Deploy Steps
1. Run `supabase/migrations/20270105_ask_wg_discovery.sql` in **Supabase SQL Editor**.
2. Deploy Edge Functions:
   - `npx supabase functions deploy discovery-chat --project-ref dtyyptbqbwvwxvtexenr`
   - `npx supabase functions deploy discovery-lead --project-ref dtyyptbqbwvwxvtexenr`
3. Merge `feat/ask-wg` into `main` (after staging verification), bump `_work/build_production.py`, run `py _work/build_production.py`, and upload the zip to `public_html/wg/`.

## Rollback
- **Frontend:** Remove `<AskWgWidget />` from `site-src/src/App.jsx` and re-deploy, or revert the merge commit on `main`.
- **Backend:** `discovery-chat` and `discovery-lead` are additive and isolated; existing site, newsletter, and hamper flows have zero dependency on them.
