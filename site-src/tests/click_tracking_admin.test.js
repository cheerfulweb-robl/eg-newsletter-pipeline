import { describe, it, expect, vi } from 'vitest';
import { isAdminSurface, recordSponsorClick, recordSponsorImpressions, recordSearchClick } from '../src/utils/links.js';

describe('admin page click exclusion & search click tracking', () => {
  it('identifies staff and admin URLs as non-trackable surfaces', () => {
    expect(isAdminSurface('/staff/clicks.html')).toBe(true);
    expect(isAdminSurface('/staff/search-sponsors.html')).toBe(true);
    expect(isAdminSurface('/admin')).toBe(true);
    expect(isAdminSurface('/hamper/admin.html')).toBe(true);
    expect(isAdminSurface('/')).toBe(false);
    expect(isAdminSurface('/discovery')).toBe(false);
    expect(isAdminSurface('/businesses/route-48')).toBe(false);
  });

  it('calls wg_record_search_click on public search pages', () => {
    const rpc = vi.fn(() => Promise.resolve({ data: true, error: null }));
    recordSearchClick({ rpc }, { query: 'bagels', title: 'Butter Bee Bagel', business: 'Butter Bee Bagel', page: 'search-results' });
    expect(rpc).toHaveBeenCalledWith('wg_record_search_click', expect.objectContaining({
      query_input: 'bagels',
      title_input: 'Butter Bee Bagel',
      business_input: 'Butter Bee Bagel',
      page_input: 'search-results',
    }));
  });

  it('ignores empty search queries', () => {
    const rpc = vi.fn(() => Promise.resolve({ data: true, error: null }));
    recordSearchClick({ rpc }, { query: '   ', title: '' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('still records sponsor clicks and impressions on public pages', () => {
    const rpc = vi.fn(() => Promise.resolve({ data: '', error: null }));
    const id = '11111111-1111-4111-8111-111111111111';
    recordSponsorClick({ rpc }, id, 'home-search');
    recordSponsorImpressions({ rpc }, [id], 'home-search');
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
