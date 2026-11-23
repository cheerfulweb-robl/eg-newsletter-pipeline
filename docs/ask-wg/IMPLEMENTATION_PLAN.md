# Ask WG — Implementation Plan & Status

- **Gate A (Complete):** Read-only audit in `docs/ask-wg/AUDIT.md`; owner approved AI budget, Georgina-first `Out of Area` fallback, `contact@welcomegeorgina.ca` lead alerts, and `feat/ask-wg` branch.
- **Stage 1 (Complete):** `supabase/migrations/20270105_ask_wg_discovery.sql` + `tests/test_ask_wg.py`.
- **Stage 2 (Complete):** `supabase/functions/discovery-chat/index.ts` and `supabase/functions/discovery-lead/index.ts`.
- **Stage 3 & 4 (Complete in code, pending Gate B–D live deploy):** `site-src/src/components/AskWgWidget.jsx` mounted in `site-src/src/App.jsx`, `docs/ask-wg/TEST_PLAN.md`, and `docs/ask-wg/DEPLOYMENT.md`.
