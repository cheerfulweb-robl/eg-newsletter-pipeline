welcomeeg_production_deploy_2026-11-20_v72.2.zip
=================================================
Built from welcomegeorgina-redesign commit 047db0f (v72.2).
All welcomegeorgina.ca domain/brand references have been updated to welcomeeg.ca /
Welcome East Gwillimbury, and all Georgina Supabase/GTM/Clarity/Stripe keys have
been replaced with YOUR_* placeholders.

Before uploading to public_html/eg/:
1. Complete Phase 1-3 in docs/welcomeeg_prebuild_checklist.docx (Supabase, Brevo, Stripe, brand assets).
2. Fill in config/eg.site.json and site-src/.env.eg.
3. Rebuild welcomeeg_production_deploy_YYYY-MM-DD_vXX.X.zip using --site eg in build_production.py.
