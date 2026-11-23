// One list of East Gwillimbury towns and hamlets, used by every form and filter.
// Keep in sync with WG_COMMUNITIES / wgCommunityFromAddress in
// website/staff/admin-approvals.html (static pages cannot import this file).
export const GEORGINA_COMMUNITIES = [
  'Brown Hill',
  'Franklin',
  'Holland Landing',
  'Holt',
  'Mount Albert',
  'Queensville',
  'Ravenshoe',
  'River Drive Park',
  'Sharon'
];

// For neighbouring businesses outside East Gwillimbury.
export const OUT_OF_AREA = 'Out of Area';

// Address words that identify a community.
const ADDRESS_HINTS = [
  ['river drive park', 'River Drive Park'],
  ['river drive', 'River Drive Park'],
  ['holland landing', 'Holland Landing'],
  ['mount albert', 'Mount Albert'],
  ['brown hill', 'Brown Hill'],
  ['queensville', 'Queensville'],
  ['ravenshoe', 'Ravenshoe'],
  ['franklin', 'Franklin'],
  ['sharon', 'Sharon'],
  ['holt', 'Holt']
];

// Neighbouring municipalities / towns outside East Gwillimbury -> automatically Out of Area.
const NEIGHBOUR_HINTS = [
  'bradford west gwillimbury',
  'whitchurch-stouffville',
  'whitchurch stouffville',
  "jackson's point",
  'jacksons point',
  'jackson point',
  'roches point',
  'port bolster',
  'willow beach',
  'island grove',
  'richmond hill',
  'stouffville',
  'port perry',
  'cannington',
  'sunderland',
  'newmarket',
  'king city',
  'schomberg',
  'beaverton',
  'pefferlaw',
  'georgina',
  'keswick',
  'innisfil',
  'bradford',
  'uxbridge',
  'belhaven',
  'virginia',
  'markham',
  'vaughan',
  'orillia',
  'baldwin',
  'sutton',
  'aurora',
  'barrie',
  'zephyr',
  'udora',
  'egypt',
  'toronto'
];

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The town named in an address, or null. "(Out of Area)" always wins. Otherwise
// the town mentioned LAST is used, because the town follows the street:
// "123 Yonge St, Holland Landing" is Holland Landing,
// "47 Harry Walker Pkwy, Newmarket" is Out of Area, "Leslie St, East Gwillimbury" is East Gwillimbury.
export function communityFromAddress(location) {
  const loc = (location || '').toLowerCase().replace(/[‘’]/g, "'");
  if (loc.includes('out of area')) return OUT_OF_AREA;
  let best = null;
  let bestAt = -1;
  for (const [hint, name] of ADDRESS_HINTS) {
    const re = new RegExp(`\\b${escapeRe(hint)}\\b`, 'g');
    let m;
    while ((m = re.exec(loc)) !== null) {
      if (m.index > bestAt) { bestAt = m.index; best = name; }
    }
  }
  const gRe = /\beast\s+gwillimbury\b/g;
  let gm;
  while ((gm = gRe.exec(loc)) !== null) {
    if (gm.index > bestAt) { bestAt = gm.index; best = null; }
  }
  for (const hint of NEIGHBOUR_HINTS) {
    const re = new RegExp(`\\b${escapeRe(hint)}\\b`, 'g');
    let m;
    while ((m = re.exec(loc)) !== null) {
      if (m.index > bestAt) { bestAt = m.index; best = OUT_OF_AREA; }
    }
  }
  return best;
}

// The community picked on the form wins; otherwise read it from the address.
// "All East Gwillimbury" / "East Gwillimbury" are not a town, so the address decides.
export function resolveCommunity(stored, location) {
  const s = (stored || '').trim();
  if (s.toLowerCase() === OUT_OF_AREA.toLowerCase()) return OUT_OF_AREA;
  const match = GEORGINA_COMMUNITIES.find(c => c.toLowerCase() === s.toLowerCase());
  if (match) return match;
  const isGeneral = !s || /^(all\s+)?east\s+gwillimbury$/i.test(s);
  return (!isGeneral && communityFromAddress(s)) || communityFromAddress(location) || 'East Gwillimbury';
}

// Store addresses one way everywhere: add ", East Gwillimbury, ON" only when the
// address names no province, postal code or East Gwillimbury, and never for Out of Area.
export function normalizeAddress(address, community) {
  const a = (address || '').trim();
  if (!a) return a;
  if (community === OUT_OF_AREA) return a;
  const hasProvince = /[,\s]ON\b/.test(a) || /\bontario\b/i.test(a);
  const hasPostal = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i.test(a);
  if (/east\s+gwillimbury/i.test(a) || hasProvince || hasPostal) return a;
  return `${a}, East Gwillimbury, ON`;
}

// Dining titles carry the service options as a tag: "[Eat-In, Take-Out] Pasta Night".
// Any bracket mentioning a service ("[Dine-In Only]", "[Pick-Up]") counts as a tag.
const SERVICE_TAG = /\[[^\]]*\b(?:eat|dine|take|pick|deliver)[^\]]*\]\s*/gi;

export function stripServiceTags(title) {
  return (title || '').replace(SERVICE_TAG, '').replace(/\s{2,}/g, ' ').trim();
}

// Words in free text (title/description) that mean a service, as whole phrases,
// so "seating" or "reheating" do not count as Eat In.
const EAT_IN = /\beat[\s-]in\b|\bdine[\s-]?in\b/;
const TAKE_OUT = /\btake[\s-]?out\b|\bpick[\s-]?up\b/;
const DELIVERY = /\bdeliver(?:y|s|ies|ing)?\b/;

// Returns ['Eat In', 'Take Out', 'Delivery'] (subset). The tag in the title is
// authoritative; without one, fall back to reading the title and description.
export function parseServiceTypes(title, summary) {
  const tags = (title || '').match(SERVICE_TAG);
  const out = [];
  const text = (tags ? tags.join(' ') : `${title || ''} ${summary || ''}`).toLowerCase();
  if (EAT_IN.test(text)) out.push('Eat In');
  if (TAKE_OUT.test(text)) out.push('Take Out');
  if (DELIVERY.test(text)) out.push('Delivery');
  return out;
}

// Text for a Google Maps search: keep addresses that already name a province,
// postal code, East Gwillimbury or an Out of Area town; otherwise add ", East Gwillimbury, ON".
export function mapsQuery(location) {
  const raw = (location || '').trim();
  const a = raw.replace(/\s*\(out of area\)\s*/i, ' ').trim();
  if (!a) return 'East Gwillimbury, ON';
  if (/out of area/i.test(raw)) return a;
  return normalizeAddress(a, '');
}

// Dining service options a submitter can pick. None picked = none shown.
export const SERVICE_OPTIONS = ['Eat In', 'Take Out', 'Delivery'];

// Services for a listing: the stored service_options (even an empty list) win;
// older listings without that field fall back to reading their title/description.
export function serviceTypesFor(row) {
  if (row && Array.isArray(row.service_options)) {
    return SERVICE_OPTIONS.filter(s => row.service_options.includes(s));
  }
  return parseServiceTypes(row?.title, row?.summary);
}
