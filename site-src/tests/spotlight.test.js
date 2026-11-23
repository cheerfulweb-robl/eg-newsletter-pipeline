import { describe, it, expect } from 'vitest';
import { pickSpotlight, selectSpotlightPageItems } from '../src/utils/spotlight';

const todayMid = new Date(2026, 10, 15);
const ev = (id, extra = {}) => ({ id, title: `Event ${id}`, category: 'upcoming_events', event_start_date: '2026-12-05', ...extra });

describe('selectSpotlightPageItems', () => {
  const rows = [
    ev('cur-sched', { business_name: 'Lakeside Bakery' }),
    ev('cur-flag', { business_name: 'Harbour Grill', is_spotlight: true }),
    ev('regular-upcoming', { business_name: 'Unselected Event' }),
    ev('past-spot-recent', { event_start_date: '2026-08-10', is_featured: true }),
    ev('past-spot-sched', { event_start_date: '2025-11-01' }),
    ev('past-spot-too-old', { event_start_date: '2025-09-01', is_spotlight: true }),
    ev('past-unselected', { event_start_date: '2026-09-15' }),
  ];

  it('returns only current spotlight businesses and never picks random unselected listings', () => {
    const res = selectSpotlightPageItems(rows, {
      currentIds: ['cur-sched'],
      pastIds: ['past-spot-sched'],
      todayMid,
    });
    expect(res.currentSpotlights.map((s) => s.item.id)).toEqual(['cur-sched', 'cur-flag']);
  });

  it('returns empty currentSpotlights when no spotlight is scheduled or flagged', () => {
    const res = selectSpotlightPageItems(
      [ev('regular-upcoming'), ev('past-unselected', { event_start_date: '2026-09-15' })],
      { todayMid }
    );
    expect(res.currentSpotlights).toEqual([]);
    expect(res.pastSpotlightEvents).toEqual([]);
  });

  it('includes only past events in the last 13 months that were selected as spotlight items', () => {
    const res = selectSpotlightPageItems(rows, {
      currentIds: ['cur-sched'],
      pastIds: ['past-spot-sched'],
      todayMid,
    });
    // past-spot-recent (Aug 2026, flagged) and past-spot-sched (Nov 2025, in pastIds) are within 13 months of Nov 15, 2026
    // past-spot-too-old (Sep 2025) is >13 months ago and excluded; past-unselected is excluded
    expect(res.pastSpotlightEvents.map((e) => e.id)).toEqual(['past-spot-recent', 'past-spot-sched']);
  });
});

describe('pickSpotlight', () => {
  const rows = [
    ev('e1'),
    ev('e2'),
    ev('old', { event_start_date: '2026-10-01' }),
    { id: 'd1', title: 'Fish fry Friday', category: 'dining_deals' },
    { id: 's1', title: '[Sale] Boots', category: 'retail_sale' },
  ];

  it('uses the admin-scheduled listing first, whatever its kind', () => {
    const r = pickSpotlight([...rows, ev('f', { is_featured: true })], { scheduledId: 'd1', todayMid });
    expect(r).toMatchObject({ source: 'scheduled', kind: 'dining' });
    expect(r.item.id).toBe('d1');
  });

  it('ignores a scheduled id that is not in the approved list', () => {
    expect(pickSpotlight(rows, { scheduledId: 'gone', todayMid }).source).toBe('random');
  });

  it('then a current featured listing, skipping expired ones', () => {
    const r = pickSpotlight([...rows, ev('fx', { is_featured: true, event_start_date: '2026-10-01' }), ev('f', { featured: true })], { todayMid });
    expect(r.source).toBe('featured');
    expect(r.item.id).toBe('f');
  });

  it('otherwise a random current event (never sales, dining or past events)', () => {
    const ids = new Set([0, 0.3, 0.6, 0.99].map((seed) => pickSpotlight(rows, { seed, todayMid }).item.id));
    expect([...ids].sort()).toEqual(['e1', 'e2']);
    expect(pickSpotlight(rows, { seed: 0.99, todayMid }).source).toBe('random');
  });

  it('returns nothing when there is nothing current', () => {
    expect(pickSpotlight([], { todayMid })).toEqual({ item: null, source: null, kind: null });
    expect(pickSpotlight(null, { todayMid }).item).toBeNull();
  });
});
