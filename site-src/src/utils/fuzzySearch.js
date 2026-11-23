/**
 * Forgiving search: handles plurals ("bagels" <-> "bagel", "berries" <-> "berry"),
 * small typos ("bagle" / "begel" / "sandwhiches"), apostrophes/accents, and extra
 * words in multi-word searches.
 *
 * When filtering a list with `filterByQuery`, items matching every meaningful word
 * appear first (exact > plural > typo). If nothing matches every word (for example
 * "fresh bagels shop" when the listing only says "Butter Bee Bagel"), partial
 * matches are shown ranked by how many words matched instead of an empty screen.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'of', 'for', 'to', 'and', 'or', 'near', 'with', 'by', 'from',
]);

export function normalizeText(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Light English plural stemmer: berries -> berry, boxes -> box, bagels -> bagel. */
export function stem(word) {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 4 && /(sses|xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

/** Damerau-Levenshtein edit distance (adjacent swaps count as 1 edit). */
export function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = [];
  for (let i = 0; i <= a.length; i++) rows.push([i]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = v;
    }
  }
  return rows[a.length][b.length];
}

function allowedEdits(len) {
  if (len < 4) return 0; // short words (<=3 chars) must match closely to avoid noise
  return len <= 7 ? 1 : 2;
}

function queryTokens(query) {
  const all = normalizeText(query).split(' ').filter(Boolean);
  if (all.length <= 1) return all;
  const meaningful = all.filter((w) => !STOP_WORDS.has(w));
  return meaningful.length > 0 ? meaningful : all;
}

/** Score a single text against a query: { matched, total, score }. */
export function searchScore(text, query) {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return { matched: 0, total: 0, score: 1 };
  const norm = normalizeText(text);
  const words = norm.split(' ').filter(Boolean);
  const stemmedWords = words.map(stem);
  const stemmedText = stemmedWords.join(' ');

  let matched = 0;
  let score = 0;
  for (const token of tokens) {
    const st = stem(token);
    if (norm.includes(token)) {
      matched += 1;
      score += 3;
    } else if (stemmedText.includes(st)) {
      matched += 1;
      score += 2;
    } else {
      const edits = allowedEdits(st.length);
      if (edits > 0 && stemmedWords.some((w) => editDistance(st, w, edits) <= edits)) {
        matched += 1;
        score += 1;
      }
    }
  }
  return { matched, total: tokens.length, score };
}

/** True when every meaningful word in `query` matches `text` (exact, plural, or typo). */
export function matchesQuery(text, query) {
  const res = searchScore(text, query);
  return res.total === 0 || res.matched === res.total;
}

/**
 * Filter a list with forgiving search:
 * - Prefers items matching all meaningful query words, ranked by exact > plural > typo.
 * - If a multi-word query finds zero full matches, falls back to partial matches
 *   (so an extra descriptive word like "bagel shop" still surfaces bagel results).
 */
export function filterByQuery(items, query, getText) {
  if (!Array.isArray(items)) return [];
  const tokens = queryTokens(query);
  if (tokens.length === 0) return items;

  const scored = [];
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const res = searchScore(getText(item), query);
    if (res.matched > 0) scored.push({ item, idx, ...res });
  }
  const full = scored.filter((s) => s.matched === s.total);
  const chosen = full.length > 0 ? full : scored;
  chosen.sort((a, b) => (b.matched - a.matched) || (b.score - a.score) || (a.idx - b.idx));
  return chosen.map((s) => s.item);
}
