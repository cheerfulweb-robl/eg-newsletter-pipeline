import { describe, it, expect } from 'vitest';
import { matchesQuery, filterByQuery, stem } from '../src/utils/fuzzySearch.js';

describe('forgiving search', () => {
  const text = 'Butter Bee Bagel Co. fresh bagel sandwiches and berry pies at Route 48';

  it('finds plurals: bagels matches bagel and bagel matches bagels', () => {
    expect(matchesQuery('Fresh Bagel shop', 'bagels')).toBe(true);
    expect(matchesQuery('Fresh bagels shop', 'bagel')).toBe(true);
  });

  it('handles -ies and -es plurals', () => {
    expect(stem('berries')).toBe('berry');
    expect(stem('boxes')).toBe('box');
    expect(matchesQuery(text, 'berries')).toBe(true);
    expect(matchesQuery(text, 'pie')).toBe(true);
  });

  it('forgives small typos', () => {
    expect(matchesQuery(text, 'bagle')).toBe(true);
    expect(matchesQuery(text, 'begel')).toBe(true);
    expect(matchesQuery(text, 'sandwhiches')).toBe(true);
  });

  it('ignores filler stop words and word order', () => {
    expect(matchesQuery(text, 'bagels at route 48')).toBe(true);
    expect(matchesQuery(text, 'route bagel')).toBe(true);
  });

  it('falls back to partial matches when an extra word has no full match', () => {
    const items = [
      { id: 1, title: 'Butter Bee Bagel Co.' },
      { id: 2, title: 'East Gwillimbury Marina' },
    ];
    const res = filterByQuery(items, 'fresh bagels bakery', (i) => i.title);
    expect(res.map((i) => i.id)).toEqual([1]);
  });

  it('ranks full matches ahead of partial matches', () => {
    const items = [
      { id: 1, title: 'Route 48 Pasta Night' },
      { id: 2, title: 'Route 48 Bagel Breakfast' },
    ];
    const res = filterByQuery(items, 'route 48 bagels', (i) => i.title);
    expect(res.map((i) => i.id)).toEqual([2]);
  });

  it('does not let short words match loosely', () => {
    expect(matchesQuery('cat food', 'car')).toBe(false);
    expect(matchesQuery(text, 'xyzzy')).toBe(false);
  });

  it('treats an empty query as a match and ignores case and apostrophes', () => {
    expect(matchesQuery(text, '')).toBe(true);
    expect(matchesQuery("Jackson's Point", 'JACKSONS')).toBe(true);
  });
});
