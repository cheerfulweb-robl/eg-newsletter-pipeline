// Links to listing detail pages and click-tracked links to merchant websites (v59).
//
// Every outbound merchant link goes through /news/go.html with the listing's id.
// go.html asks the database (wg_track_click) where the listing points, records the
// click for the advertiser report, and redirects. The web address itself is never
// put in the link, so these links can't be used to send people to other sites.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_RE.test(String(value || ''));
}

/**
 * Click-tracked link to the merchant's own website.
 * kind: 'listing' (events, dining, sales), 'directory' or 'hamper_offer'.
 * page: short name of the page the click came from, shown in the click report.
 * Returns null when the id isn't a real listing id (the caller then shows no link).
 */
export function trackedLink(kind, id, page) {
  if (!isUuid(id)) return null;
  const p = String(page || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  return `/news/go.html?k=${encodeURIComponent(kind)}&id=${id}${p ? `&p=${p}` : ''}`;
}

const DINING_CATS = ['dining', 'restaurant', 'food_and_drink', 'dining_deals'];
const SALE_CATS = ['sale', 'sales', 'local_sales', 'special_sale', 'sales_deal'];

/** 'dining' | 'sale' | 'event' for a listing (raw category, or the calendars' item.type). */
export function listingKind(item) {
  const c = String(item?.category || '').toLowerCase().trim();
  if (DINING_CATS.includes(c) || item?.type === 'dining') return 'dining';
  if (SALE_CATS.includes(c) || item?.type === 'sale' || String(item?.title || '').startsWith('[Sale]')) return 'sale';
  return 'event';
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Friendly Welcome East Gwillimbury page for any listing (v61):
 * /events/<name>, /dining/<name> or /sales/<name>. Falls back to the id when a
 * listing has no address name yet.
 */
export function detailPath(item) {
  if (!item) return '/events';
  const base = { dining: '/dining/', sale: '/sales/', event: '/events/' }[listingKind(item)];
  if (item.slug && SLUG_RE.test(item.slug)) return base + item.slug;
  if (isUuid(item.id)) return base + item.id;
  return '/events';
}

/** Business page for a Businesses-directory entry. */
export function businessPath(listing) {
  if (listing && listing.slug && SLUG_RE.test(listing.slug)) return `/businesses/${listing.slug}`;
  return '/directory';
}

/**
 * PostgREST filter that finds a row by its current address name or any earlier one
 * (old_slugs), so links shared before v61 keep working. Only a-z, 0-9 and dashes
 * are kept, so nothing can be injected into the filter.
 */
export function slugOrAliasFilter(key) {
  const safe = String(key || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 200) || 'x';
  return `slug.eq.${safe},old_slugs.cs.{${safe}}`;
}

/** True when a listing has its own website worth linking to (not just our site). */
export function hasMerchantLink(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  return !/^https?:\/\/(www\.)?welcomeeg\.ca(\/|$)/i.test(u);
}

/** Same anonymous visitor id go.html uses, so "unique visitors" lines up in the click report. */
export function visitorHash() {
  try {
    let v = localStorage.getItem('gd_visitor_hash') || '';
    if (!v) {
      v = 'v-' + Math.random().toString(36).slice(2, 11) + '-' + Date.now().toString(36);
      localStorage.setItem('gd_visitor_hash', v);
    }
    return v;
  } catch {
    return '';
  }
}

/** True when the visitor is currently on a staff/admin page (never tracked in click stats). */
export function isAdminSurface(pathname) {
  const p = String(pathname !== undefined ? pathname : (typeof window !== 'undefined' && window.location ? window.location.pathname : '')).toLowerCase();
  return /(^|\/)(staff|admin)(\/|$)|\/hamper\/admin\.html/.test(p);
}

/**
 * Record a click on a sponsored "Try searching" keyword that leads to a site search or business page.
 * Fire-and-forget: never blocks or breaks the navigation. (Website sponsors are
 * recorded by go.html instead.) Skips tracking on admin/staff pages.
 */
export function recordSponsorClick(client, sponsorId, page) {
  if (!client || !isUuid(sponsorId) || isAdminSurface()) return;
  try {
    Promise.resolve(client.rpc('wg_record_sponsor_click', {
      id_input: sponsorId,
      page_input: String(page || '').slice(0, 60),
      visitor_input: visitorHash(),
    })).catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * Record impressions for sponsored spots currently visible on the page.
 * Fire-and-forget: batch RPC call with deduplication handled by the server.
 * Skips tracking on admin/staff pages.
 */
export function recordSponsorImpressions(client, sponsorIds, page) {
  if (!client || !Array.isArray(sponsorIds) || sponsorIds.length === 0 || isAdminSurface()) return;
  const validIds = sponsorIds.filter(isUuid);
  if (validIds.length === 0) return;
  try {
    Promise.resolve(client.rpc('wg_record_sponsor_impressions', {
      ids_input: validIds,
      page_input: String(page || 'home-search').slice(0, 60),
      visitor_input: visitorHash(),
    })).catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * Record a search or a click from the Search Results page into the dedicated
 * "Searches & Search Results" stats category. Skips tracking on admin pages.
 */
export function recordSearchClick(client, { query = '', title = '', business = '', itemId = null, targetUrl = '', page = 'search-results' } = {}) {
  if (!client || isAdminSurface()) return;
  const q = String(query || '').trim();
  const t = String(title || '').trim();
  if (!q && !t) return;
  try {
    Promise.resolve(client.rpc('wg_record_search_click', {
      query_input: q.slice(0, 120),
      title_input: (t || `Search: ${q}`).slice(0, 300),
      business_input: String(business || 'Search Results').slice(0, 200),
      item_id_input: isUuid(itemId) ? itemId : null,
      target_url_input: String(targetUrl || `/discovery?q=${encodeURIComponent(q)}`).slice(0, 2000),
      page_input: String(page || 'search-results').slice(0, 60),
      visitor_input: visitorHash(),
    })).catch(() => {});
  } catch {
    /* ignore */
  }
}

// Only http(s) links may be used as href; anything else (javascript:, data:) becomes "#".
export function safeHref(url) {
  const u = String(url || '').trim();
  return /^https?:\/\//i.test(u) ? u : '#';
}

// Columns of vendor_events the public site may read. Submitter email, contact name and the
// email-verification fields are not readable with the public key (see migration 20261125).
// Approved listings that have not ended (PostgREST .or() filter). Uses yesterday's UTC date so a
// listing ending today in Toronto is never cut early; pages still filter by the exact day.
export const notEndedFilter = () =>
  `expires_after.is.null,expires_after.gte.${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}`;

export const PUBLIC_LISTING_COLUMNS = 'id, slug, old_slugs, title, business_name, category, community, contact_phone, created_at, date_type, event_date_label, event_start_date, expires_after, image_url, is_featured, latitude, longitude, link, location, price_text, recurrence_rule, save_count, status, summary, view_count, service_options, sale_category';

// One website-link rule for every form: optional; "route48.ca" becomes "https://route48.ca";
// only http(s) addresses with a real domain are accepted. Returns '' (none given),
// the cleaned address, or null (not a usable link). Same rule as wgNormalizeLink on staff pages.
export function normalizeLink(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || /\s/.test(s)) return null;
    return u.href;
  } catch (e) {
    return null;
  }
}
