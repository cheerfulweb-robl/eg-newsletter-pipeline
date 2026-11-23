// Picks the "Current Active Spotlight" on /spotlight from approved vendor_events rows.
// Order:
//   1. the listing an admin scheduled for right now (wg_active_spotlight(), any kind)
//   2. a still-current listing flagged featured (is_featured / featured / is_spotlight)
//   3. a random current event (seed in [0, 1) keeps the pick steady for one visit)

import { getTorontoTodayMidnight, parseToMidnight } from '../services/discoveryService';
import { classifyRow, isCurrent } from './searchSuggestions';

export const KIND_LABELS = { events: 'Event', sales: 'Sale', dining: 'Dining Special' };

export const isFlaggedSpotlight = (e) =>
  Boolean(e && (e.is_featured === true || e.featured === true || e.is_spotlight === true));

/**
 * Returns the date cutoff 13 calendar months before `todayMid`.
 * @param {Date} todayMid
 * @returns {Date}
 */
export function getThirteenMonthsAgoMidnight(todayMid) {
  const base = todayMid || getTorontoTodayMidnight();
  const d = new Date(base.getFullYear(), base.getMonth() - 13, base.getDate(), 0, 0, 0, 0);
  return d;
}

/**
 * Resolves the effective date (midnight) of a listing for past/archive filtering.
 * Uses expires_after or event_end_date first (when the event ended), then event_start_date, then created_at.
 * @param {object} row
 * @returns {Date|null}
 */
export function getListingEndMidnight(row) {
  if (!row) return null;
  const raw =
    row.expires_after ||
    row.event_end_date ||
    row.event_start_date ||
    (row.created_at ? String(row.created_at).slice(0, 10) : null);
  return raw ? parseToMidnight(String(raw).slice(0, 10)) : null;
}

/**
 * Selects items for the /spotlight page:
 *   - currentSpotlights: ONLY current spotlight business(es) (scheduled right now or flagged spotlight & current).
 *     Never picks random un-selected listings.
 *   - pastSpotlightEvents: ONLY past events in the last 13 months that have been selected as spotlight items
 *     (in pastIds from spotlight_schedule or flagged is_spotlight / is_featured / featured).
 *
 * @param {Array<object>} rows approved vendor_events rows
 * @param {{currentIds?: Array<string>, pastIds?: Array<string>, scheduledId?: string|null, todayMid?: Date}} opts
 * @returns {{currentSpotlights: Array<{item: object, source: 'scheduled'|'featured', kind: string}>, pastSpotlightEvents: Array<object>}}
 */
export function selectSpotlightPageItems(
  rows,
  { currentIds = [], pastIds = [], scheduledId = null, todayMid } = {}
) {
  const list = Array.isArray(rows) ? rows : [];
  const today = todayMid || getTorontoTodayMidnight();
  const cutoff13m = getThirteenMonthsAgoMidnight(today);

  const activeScheduleIds = [];
  if (Array.isArray(currentIds)) {
    for (const id of currentIds) {
      if (id && !activeScheduleIds.includes(id)) activeScheduleIds.push(id);
    }
  }
  if (scheduledId && !activeScheduleIds.includes(scheduledId)) {
    activeScheduleIds.push(scheduledId);
  }

  const currentSpotlights = [];
  const activeIdSet = new Set();

  // 1. Admin-scheduled current spotlight business(es)
  for (const id of activeScheduleIds) {
    const found = list.find((e) => e && e.id === id);
    if (found && !activeIdSet.has(found.id)) {
      activeIdSet.add(found.id);
      currentSpotlights.push({
        item: found,
        source: 'scheduled',
        kind: classifyRow(found),
      });
    }
  }

  // 2. Any current listing explicitly flagged as a spotlight item
  for (const e of list) {
    if (!e || activeIdSet.has(e.id)) continue;
    const kind = classifyRow(e);
    if (kind !== 'skip' && isFlaggedSpotlight(e) && isCurrent(e, kind, today)) {
      activeIdSet.add(e.id);
      currentSpotlights.push({
        item: e,
        source: 'featured',
        kind,
      });
    }
  }

  // 3. Past events in the last 13 months that were selected as spotlight items
  const pastScheduleSet = new Set(Array.isArray(pastIds) ? pastIds.filter(Boolean) : []);
  const pastSpotlightEvents = list
    .filter((e) => {
      if (!e || activeIdSet.has(e.id)) return false;
      const wasSelectedAsSpotlight = pastScheduleSet.has(e.id) || isFlaggedSpotlight(e);
      if (!wasSelectedAsSpotlight) return false;

      const endMid = getListingEndMidnight(e);
      if (!endMid) return false;
      // Must be in the past (< today) and within the last 13 months (>= cutoff13m)
      return endMid.getTime() < today.getTime() && endMid.getTime() >= cutoff13m.getTime();
    })
    .sort((a, b) => {
      const ta = getListingEndMidnight(a)?.getTime() || 0;
      const tb = getListingEndMidnight(b)?.getTime() || 0;
      return tb - ta;
    });

  return { currentSpotlights, pastSpotlightEvents };
}

/**
 * @param {Array<object>} rows approved vendor_events rows
 * @param {{scheduledId?: string|null, seed?: number, todayMid?: Date}} opts
 * @returns {{item: object|null, source: 'scheduled'|'featured'|'random'|null, kind: string|null}}
 */
export function pickSpotlight(rows, { scheduledId = null, seed = 0, todayMid } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const today = todayMid || getTorontoTodayMidnight();
  const wrap = (item, source) => ({ item, source, kind: item ? classifyRow(item) : null });

  if (scheduledId) {
    const s = list.find((e) => e.id === scheduledId);
    if (s) return wrap(s, 'scheduled');
  }

  const current = (e) => {
    const kind = classifyRow(e);
    return kind !== 'skip' && isCurrent(e, kind, today);
  };
  const featured = list.find((e) => isFlaggedSpotlight(e) && current(e));
  if (featured) return wrap(featured, 'featured');

  const events = list.filter((e) => classifyRow(e) === 'events' && isCurrent(e, 'events', today));
  if (events.length) {
    const i = Math.min(events.length - 1, Math.floor(Math.max(0, seed) * events.length));
    return wrap(events[i], 'random');
  }
  return wrap(null, null);
}
