# Community Package — Next-Phase Feature Roadmap (Large Cities & Regions)

> **Status:** Planned for a future phase (**not** active in the current `v72.24` baseline).  
> **Target Use Case:** Scaling the Community Package beyond small/mid-sized towns (e.g., Georgina, East Gwillimbury) to larger cities and dense commercial corridors (e.g., **Vaughan, North York, Newmarket**).  
> *(Note: Exact `google_place_id` deduplication is already implemented in `v72.24`.)*

---

## 1. Persistent "Ignore / Not a Fit" List (`lead_hunter_ignored_places`)
- **Why:** In larger cities, sweeps surface many businesses that an admin intentionally skips (e.g., corporate offices, PO boxes, or non-consumer B2B warehouses). Without an ignore list, future monthly sweeps will surface those same unchecked businesses again.
- **Next-Phase Change:**
  1. Add a **"Dismiss / Ignore Forever"** action in Lead Hunter's Review Results table.
  2. Store dismissed `place_id`s in `newsletter_settings` (or a dedicated `lead_hunter_ignored_places` table) so future Batch Sweeps automatically set them aside alongside duplicates.

## 2. Chunked / Resumable Batch Sweep (For > 50 Presets)
- **Why:** `website/api/lead_hunter.php` enforces a **60 requests per 10 minutes** rate limit, and `runBatchSweep()` currently runs inside an open browser tab. A large city (e.g., Vaughan or North York with 40+ plazas and 20+ sub-categories) will exceed 60 steps in one sitting.
- **Next-Phase Change:**
  1. Persist sweep progress/cursor (`completed_steps`, `pending_steps`) in `localStorage` / Supabase so a sweep can pause cleanly when approaching the 10-minute rate window and **Resume** later without restarting from step 1.
  2. Optionally move large-city sweeps to a scheduled background Edge Function / GitHub Action that runs in chunks over the week and notifies admins when new Pending Approval leads are ready.
