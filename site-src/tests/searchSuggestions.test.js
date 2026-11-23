import { describe, it, expect } from 'vitest';
import { buildSearchSuggestions, classifyRow, mergeWithSponsors } from '../src/utils/searchSuggestions';

const todayMid = new Date(2026, 10, 15); // 15 Nov 2026
const future = '2026-12-05';
const past = '2026-10-01';

const ev = (title, extra = {}) => ({ title, category: 'upcoming_events', event_start_date: future, summary: '', ...extra });

// Same substring test the destination pages use
const eventHay = (r) => `${r.title} ${r.business_name || ''} ${r.summary || ''} ${r.location || ''} ${r.category || ''}`.toLowerCase();

describe('buildSearchSuggestions', () => {
  it('classifies rows the way Home does', () => {
    expect(classifyRow({ title: '[Sale] Boots', category: 'upcoming_events' })).toBe('sales');
    expect(classifyRow({ title: 'Fish fry', category: 'dining_deals' })).toBe('dining');
    expect(classifyRow({ title: 'Clearance', category: 'special_sale' })).toBe('sales');
    expect(classifyRow({ title: 'Story time', category: 'library_events' })).toBe('events');
    expect(classifyRow({ title: 'Garage clearout', category: 'retail_sale' })).toBe('sales');
    expect(classifyRow({ title: 'Partner perk', category: 'partner_deals' })).toBe('skip');
  });

  it('returns nothing until listings exist', () => {
    expect(buildSearchSuggestions([], { todayMid })).toEqual([]);
    expect(buildSearchSuggestions(null, { todayMid })).toEqual([]);
  });

  it('suggests phrases shared by several current events and links them to discovery search', () => {
    const rows = [
      ev('Live Music at the Legion'),
      ev('Friday Live Music Night'),
      ev('Live Music & Open Mic'),
      ev('Christmas Craft Fair'),
      ev('Holiday Craft Fair at the Hall'),
      ev('Seniors Yoga'),
      ev('Live Music Past Show', { event_start_date: past }), // expired: ignored
    ];
    const out = buildSearchSuggestions(rows, { todayMid });
    const labels = out.map((s) => s.label);
    expect(labels).toContain('Live Music');
    expect(labels).toContain('Craft Fair');
    expect(labels).not.toContain('Seniors Yoga'); // only one match: not suggested for events
    const live = out.find((s) => s.label === 'Live Music');
    expect(live.count).toBe(3);
    expect(live.to).toBe('/discovery?q=Live%20Music');
    // no overlapping chips like "Music" alongside "Live Music"
    expect(labels).not.toContain('Music');
    expect(labels).not.toContain('Live');
  });

  it('every suggestion matches at least one current listing on its destination page', () => {
    const rows = [
      ev('Santa Claus Parade', { summary: 'Floats and marching bands' }),
      ev('Santa Breakfast at the Legion'),
      ev('Library Story Time', { category: 'library_events' }),
      ev('Library Lego Club', { category: 'library_events' }),
      { title: 'Wing Night Special', category: 'dining_deals', summary: 'Half-price wings' },
      { title: '[Sale] Winter Boots Clearance', category: 'special_sale', description: 'Boots 40% off' },
    ];
    const out = buildSearchSuggestions(rows, { todayMid });
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(5);
    for (const s of out) {
      const pool = rows.filter((r) => classifyRow(r) === s.kind);
      const hits = pool.filter((r) => eventHay({ ...r, summary: `${r.summary || ''} ${r.description || ''}` }).includes(s.query.toLowerCase()));
      expect(hits.length, s.label).toBeGreaterThan(0);
    }
    expect(out.find((s) => s.kind === 'dining')?.to).toMatch(/^\/dining\?search=/);
    expect(out.find((s) => s.kind === 'sales')?.to).toMatch(/^\/sales\?search=/);
  });

  it('skips place names and generic words', () => {
    const rows = [
      ev('Keswick Community Event'),
      ev('Sutton Community Event'),
      ev('Keswick Weekly Event'),
    ];
    const labels = buildSearchSuggestions(rows, { todayMid }).map((s) => s.label.toLowerCase());
    for (const bad of ['keswick', 'sutton', 'community', 'event', 'weekly']) {
      expect(labels.some((l) => l.split(' ').includes(bad)), bad).toBe(false);
    }
  });

  it('leaves out events that ResidentDiscovery files under its Sales tab', () => {
    const rows = [
      ev('Special Skating Night'),
      ev('Special Skating Lesson'),
      ev('Bake Sale Skating'),
    ];
    const labels = buildSearchSuggestions(rows, { todayMid }).map((s) => s.label.toLowerCase());
    expect(labels.some((l) => l.includes('skating'))).toBe(false);
  });

  it('skips expired dining and sales', () => {
    const rows = [
      { title: 'Old Pizza Deal', category: 'dining_deals', expires_after: past },
      { title: '[Sale] Old Clearance', category: 'special_sale', expires_after: past },
    ];
    expect(buildSearchSuggestions(rows, { todayMid })).toEqual([]);
  });
});

describe('mergeWithSponsors', () => {
  const auto = [
    { label: 'Live Music', query: 'Live Music', kind: 'events', to: '/discovery?q=Live%20Music' },
    { label: 'Craft Fair', query: 'Craft Fair', kind: 'events', to: '/discovery?q=Craft%20Fair' },
    { label: 'Pasta', query: 'Pasta', kind: 'dining', to: '/dining?search=Pasta' },
    { label: 'Boots', query: 'Boots', kind: 'sales', to: '/sales?search=Boots' },
    { label: 'Yoga', query: 'Yoga', kind: 'events', to: '/discovery?q=Yoga' },
  ];
  const id1 = '11111111-1111-4111-8111-111111111111';
  const id2 = '22222222-2222-4222-8222-222222222222';

  it('puts paid keywords first and fills the rest with automatic suggestions', () => {
    const out = mergeWithSponsors([{ id: id1, keyword: 'Butter Bee Bagel', target_kind: 'search', search_query: 'Butter Bee' }], auto);
    expect(out).toHaveLength(5);
    expect(out[0]).toMatchObject({ label: 'Butter Bee Bagel', kind: 'sponsored', sponsorId: id1, external: false, to: '/discovery?q=Butter%20Bee' });
    expect(out.slice(1).map((s) => s.label)).toEqual(['Live Music', 'Craft Fair', 'Pasta', 'Boots']);
  });

  it('website sponsors link through the click tracker, never straight to the site', () => {
    const [s] = mergeWithSponsors([{ id: id2, keyword: 'Lakeside Pizza', target_kind: 'website', search_query: null }], []);
    expect(s.external).toBe(true);
    expect(s.to).toBe(`/news/go.html?k=search_sponsor&id=${id2}&p=home-search`);
  });

  it('drops an automatic suggestion that repeats a paid keyword, and caps at 5', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `${i}`, keyword: `Spot ${i}`, target_kind: 'search' }));
    expect(mergeWithSponsors(many, auto)).toHaveLength(5);
    const out = mergeWithSponsors([{ id: id1, keyword: 'live music', target_kind: 'search' }], auto);
    expect(out.filter((s) => s.label.toLowerCase() === 'live music')).toHaveLength(1);
  });

  it('works with no sponsors (or a failed lookup)', () => {
    expect(mergeWithSponsors(null, auto)).toEqual(auto);
    expect(mergeWithSponsors([], [])).toEqual([]);
  });
});

describe('popularity and rotation', () => {
  const todayMid = new Date(2026, 10, 15);
  const mk = (title, views) => ({ title, summary: '', category: 'community_events', event_start_date: '2026-11-20', view_count: views });
  const rows = [
    mk('Holiday Craft Market', 5), mk('Winter Craft Market', 5),
    mk('Trivia Night Downtown', 900), mk('Trivia Night Uptown', 900),
    mk('Yoga Class Beginners', 1), mk('Yoga Class Advanced', 1),
    mk('Karaoke Evening One', 0), mk('Karaoke Evening Two', 0),
    mk('Pottery Workshop One', 0), mk('Pottery Workshop Two', 0),
    mk('Chess Club Meetup', 0), mk('Chess Club Tournament', 0),
    mk('Book Swap Social', 0), mk('Book Swap Brunch', 0),
  ];
  it('ranks searches whose listings get more views first', () => {
    const out = buildSearchSuggestions(rows, { todayMid, total: 3 });
    expect(out[0].label.toLowerCase()).toContain('trivia');
  });
  it('rotates between visits but always returns the requested number', () => {
    const seen = new Set();
    let s = 1;
    const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 40; i++) {
      const out = buildSearchSuggestions(rows, { todayMid, total: 3, rng });
      expect(out).toHaveLength(3);
      out.forEach((o) => seen.add(o.label));
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});
