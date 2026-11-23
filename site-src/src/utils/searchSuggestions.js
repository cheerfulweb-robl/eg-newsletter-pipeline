// Smart "Try searching" suggestions for the Home hero.
//
// Built from the approved vendor_events rows Home already loads. Each suggestion is a
// category name or a word/phrase that appears in the title or summary of current
// listings, and links to the page whose search box looks at those same fields:
//   events -> /discovery?q=   (ResidentDiscovery: title, business, organizer, summary, location, category)
//   dining -> /dining?search= (Dining: business_name, title, summary, location, service types)
//   sales  -> /sales?search=  (Sales: business_name, title, description, location, category)
// Matching uses the same lower-case substring test those pages use, so every chip
// shown has at least `minMatches` results waiting behind it.

import { formatCategoryLabel, getTorontoTodayMidnight, isExpired, parseEventOffsets } from '../services/discoveryService';

const DINING_CATS = new Set(['dining', 'restaurant', 'food_and_drink', 'dining_deals']);
// Mirrors Sales.jsx (explicit sale categories or a [Sale] title tag).
const SALE_CATS = new Set(['sale', 'retail_sale', 'special_sale']);
// Home hides these from events, and Sales/Dining don't list them by category: suggest nothing for them.
const SKIP_CATS = new Set(['partner_deals']);

// Words that would match almost everything, or that the community picker already covers.
const STOP = new Set(`
a an and are as at be by for from has have in into is it its of on or our the their this to up with your you we
all any new more most best great big little first last next every each per via not just
georgina georgina's holland landing mount albert queensville jackson sharon brown hill baldwin virginia river drive park ravenshoe
ontario york region lake simcoe south shore town township
event events sale sales special specials deal deals community weekly annual monthly daily free local join
come welcome everyone open public family friendly all-ages ages
day days night nights week weekend weekends today tonight morning afternoon evening noon
monday tuesday wednesday thursday friday saturday sunday mon tue wed thu fri sat sun
january february march april may june july august september october november december
jan feb mar apr jun jul aug sep sept oct nov dec
am pm edt est time times date dates hours ltd inc
`.trim().split(/\s+/));

const lower = (s) => String(s || '').toLowerCase();

export function classifyRow(row) {
  const cat = lower(row.category).trim();
  if (String(row.title || '').startsWith('[Sale]') || SALE_CATS.has(cat)) return 'sales';
  if (DINING_CATS.has(cat)) return 'dining';
  if (SKIP_CATS.has(cat)) return 'skip';
  return 'events';
}

export function isCurrent(row, kind, todayMid) {
  if (kind === 'events') {
    const t = lower(row.title);
    if (t.includes('submit your georgina business event') || t.includes('auto-scrape your website')) return false;
    // ResidentDiscovery moves these to its Sales tab, so they would not appear under /discovery?q= (Events tab)
    const discoveryText = lower(row.title || row.summary);
    if (discoveryText.includes('sale') || discoveryText.includes('discount') || discoveryText.includes('special')) return false;
    if (row.expires_after && isExpired(row.expires_after)) return false;
    try {
      const { endOffset, recurringDay, isOngoing } = parseEventOffsets(row, todayMid);
      if (recurringDay !== null || isOngoing) return true;
      return endOffset === null || endOffset === undefined || endOffset >= 0;
    } catch {
      return true;
    }
  }
  return !isExpired(row.expires_after);
}

const cleanTitle = (t) => String(t || '').replace(/^\[Sale\]\s*/i, '');

// Words in a title, keeping original spelling for display.
function titleWords(title) {
  return cleanTitle(title).split(/[^A-Za-z'’&]+/).map((w) => w.replace(/^['’]+|['’]+$/g, '')).filter(Boolean);
}

const usable = (w) => w.length >= 3 && !STOP.has(w.toLowerCase()) && /[a-z]/i.test(w);

function titleCase(phrase) {
  return phrase.split(' ').map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

function candidatesFor(items) {
  const cands = new Map(); // key (lower) -> display
  const add = (display) => {
    const key = display.toLowerCase();
    if (!cands.has(key)) cands.set(key, titleCase(display));
  };
  for (const it of items) {
    const label = it.category ? formatCategoryLabel(it.category) : '';
    if (label && label !== 'Community' && label.split(' ').every((w) => w === '&' || usable(w))) add(label);
    const words = titleWords(it.title);
    for (let i = 0; i < words.length; i++) {
      if (usable(words[i]) && words[i].length >= 4) add(words[i]);
      if (i + 1 < words.length && usable(words[i]) && usable(words[i + 1])) add(`${words[i]} ${words[i + 1]}`);
    }
  }
  return cands;
}

function pick(items, { max, minMatches, maxShare, rng }) {
  if (!items.length || max <= 0) return [];
  const hay = items.map((it) => lower(`${cleanTitle(it.title)} ${it.summary || ''} ${it.description || ''}`));
  const scored = [];
  for (const [key, display] of candidatesFor(items)) {
    let count = 0;
    let views = 0; // popularity: page views of the listings this word leads to
    hay.forEach((h, i) => {
      if (h.includes(key)) { count += 1; views += Math.max(0, Number(items[i].view_count) || 0); }
    });
    if (count < minMatches) continue;
    if (items.length >= 6 && count / items.length > maxShare) continue; // too broad to be useful
    const multi = key.includes(' ');
    // More listings and more views both raise the score (views on a gentle log scale)
    scored.push({ key, display, count, views, score: count * (multi ? 1.6 : 1) * (1 + Math.log10(1 + views)) });
  }
  scored.sort((a, b) => b.score - a.score || b.key.length - a.key.length || a.key.localeCompare(b.key));
  // Most popular first, skipping near-duplicates ("Market" vs "Craft Market")
  const distinct = [];
  for (const c of scored) {
    if (distinct.some((p) => p.key.includes(c.key) || c.key.includes(p.key))) continue;
    distinct.push(c);
    if (distinct.length >= (rng ? max * 3 : max)) break;
  }
  if (!rng || distinct.length <= max) return distinct.slice(0, max);
  // Rotate: each visit draws `max` from the top group, weighted by popularity, so popular
  // searches appear most often but the pills are not the same every time.
  const pool = distinct.slice();
  const chosen = [];
  while (chosen.length < max && pool.length) {
    const total = pool.reduce((n, c) => n + c.score, 0);
    let r = rng() * total;
    let idx = pool.findIndex((c) => (r -= c.score) <= 0);
    if (idx < 0) idx = pool.length - 1;
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen.sort((a, b) => b.score - a.score);
}

const ROUTES = {
  events: (q) => `/discovery?q=${encodeURIComponent(q)}`,
  dining: (q) => `/dining?search=${encodeURIComponent(q)}`,
  sales: (q) => `/sales?search=${encodeURIComponent(q)}`,
};

/**
 * @param {Array} rows approved vendor_events rows
 * @param {{ total?: number, todayMid?: Date, rng?: (() => number) | null }} opts  rng: random source for rotating
 *        the pills each visit (Home passes Math.random); leave out for the fixed most-popular list
 * @returns {Array<{label: string, query: string, count: number, kind: 'events'|'dining'|'sales', to: string}>}
 */
export function buildSearchSuggestions(rows, { total = 5, todayMid = getTorontoTodayMidnight(), rng = null } = {}) {
  const pools = { events: [], dining: [], sales: [] };
  for (const row of rows || []) {
    if (!row || !row.title) continue;
    const kind = classifyRow(row);
    if (pools[kind] && isCurrent(row, kind, todayMid)) pools[kind].push(row);
  }
  const dining = pick(pools.dining, { max: 1, minMatches: 1, maxShare: 1, rng });
  const sales = pick(pools.sales, { max: 1, minMatches: 1, maxShare: 1, rng });
  const events = pick(pools.events, { max: total - dining.length - sales.length, minMatches: 2, maxShare: 0.6, rng });
  const out = [];
  const push = (kind) => (c) => out.push({ label: c.display, query: c.display, count: c.count, kind, to: ROUTES[kind](c.display) });
  events.forEach(push('events'));
  dining.forEach(push('dining'));
  sales.forEach(push('sales'));
  return out;
}

const BUSINESS_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Paid keywords first (from wg_active_search_sponsors, already in priority order),
 * then automatic suggestions fill the remaining spots. A suggestion with the same
 * text as a paid keyword is dropped.
 * @param {Array<{id: string, keyword: string, target_kind: 'search'|'website'|'business', search_query: string|null, business_slug?: string|null}>} sponsors
 * @param {Array} auto output of buildSearchSuggestions
 */
export function mergeWithSponsors(sponsors, auto, total = 99) {
  const out = [];
  const seen = new Set();
  for (const s of sponsors || []) {
    const label = String(s?.keyword || '').trim();
    if (!s?.id || !label || seen.has(label.toLowerCase()) || out.length >= total) continue;
    const isWebsite = s.target_kind === 'website';
    const query = String(s.search_query || label).trim();
    out.push({
      label,
      query,
      kind: 'sponsored',
      sponsorId: s.id,
      external: isWebsite,
      // Website sponsors go through go.html, which records the click and redirects.
      // Business sponsors open the business's own page; if the page is not available they fall back to a search.
      to: isWebsite
        ? `/news/go.html?k=search_sponsor&id=${encodeURIComponent(s.id)}&p=home-search`
        : (s.target_kind === 'business' && BUSINESS_SLUG_RE.test(String(s.business_slug || ''))
          ? `/businesses/${s.business_slug}`
          : `/discovery?q=${encodeURIComponent(query)}`),
    });
    seen.add(label.toLowerCase());
  }
  for (const a of auto || []) {
    if (out.length >= total) break;
    if (seen.has(String(a.label).toLowerCase())) continue;
    out.push(a);
    seen.add(String(a.label).toLowerCase());
  }
  return out;
}
