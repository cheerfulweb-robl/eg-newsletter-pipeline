import { describe, it, expect } from 'vitest';
import { mergeWithSponsors } from '../src/utils/searchSuggestions.js';

const id = '11111111-1111-4111-8111-111111111111';

describe('business-page sponsors', () => {
  it('links a business sponsor to its business page, not the search page', () => {
    const [s] = mergeWithSponsors([{ id, keyword: 'Pasta Night', target_kind: 'business', search_query: null, business_slug: 'route-48' }], []);
    expect(s.to).toBe('/businesses/route-48');
    expect(s.external).toBe(false);
    expect(s.kind).toBe('sponsored');
  });

  it('falls back to search when the business page is not available or the slug is unsafe', () => {
    const [a] = mergeWithSponsors([{ id, keyword: 'Pasta Night', target_kind: 'business', business_slug: null }], []);
    expect(a.to).toBe('/discovery?q=Pasta%20Night');
    const [b] = mergeWithSponsors([{ id, keyword: 'Pasta Night', target_kind: 'business', business_slug: '../admin' }], []);
    expect(b.to).toBe('/discovery?q=Pasta%20Night');
  });

  it('keeps the website and search options working', () => {
    const [w] = mergeWithSponsors([{ id, keyword: 'Bagel', target_kind: 'website' }], []);
    expect(w.to).toContain('/news/go.html?k=search_sponsor');
    expect(w.external).toBe(true);
    const [q] = mergeWithSponsors([{ id, keyword: 'Bagel', target_kind: 'search', search_query: 'bagels' }], []);
    expect(q.to).toBe('/discovery?q=bagels');
  });
});
