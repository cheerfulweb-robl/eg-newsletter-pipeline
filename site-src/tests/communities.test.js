import { describe, it, expect } from 'vitest';
import {
  communityFromAddress, resolveCommunity, normalizeAddress, mapsQuery,
  stripServiceTags, parseServiceTypes, serviceTypesFor, OUT_OF_AREA
} from '../src/utils/communities.js';
import { safeHref } from '../src/utils/links.js';

describe('communities', () => {
  it('reads the town that follows the street', () => {
    expect(communityFromAddress('19000 Leslie St, Sharon')).toBe('Sharon');
    expect(communityFromAddress('123 Main St, Mount Albert')).toBe('Mount Albert');
    expect(communityFromAddress('100 Yonge St, Holland Landing')).toBe('Holland Landing');
    expect(communityFromAddress('45 River Drive, River Drive Park')).toBe('River Drive Park');
    expect(communityFromAddress('Newmarket, ON (Out of Area)')).toBe(OUT_OF_AREA);
    expect(communityFromAddress('47 Harry Walker Pkwy, Newmarket')).toBe(OUT_OF_AREA);
    expect(communityFromAddress('Main St')).toBeNull();
  });

  it('keeps the community the submitter picked', () => {
    expect(resolveCommunity('Queensville', '15900 Woodbine Ave')).toBe('Queensville');
    expect(resolveCommunity('Out of Area', '22 Main St, Newmarket')).toBe(OUT_OF_AREA);
    expect(resolveCommunity('All East Gwillimbury', '1 Main St, Sharon')).toBe('Sharon');
    expect(resolveCommunity('East Gwillimbury', 'Main St')).toBe('East Gwillimbury');
    expect(resolveCommunity('River Drive', '')).toBe('River Drive Park');
  });

  it('stores addresses one way', () => {
    expect(normalizeAddress('19000 Leslie St, Sharon', 'Sharon')).toBe('19000 Leslie St, Sharon, East Gwillimbury, ON');
    expect(normalizeAddress('19000 Leslie St, Sharon, ON L0G 1V0', 'Sharon')).toBe('19000 Leslie St, Sharon, ON L0G 1V0');
    expect(normalizeAddress('123 Main St, Mount Albert, Ontario', 'Mount Albert')).toBe('123 Main St, Mount Albert, Ontario');
    expect(normalizeAddress('123 Main St, Newmarket', OUT_OF_AREA)).toBe('123 Main St, Newmarket');
    expect(mapsQuery('Newmarket, ON (Out of Area)')).toBe('Newmarket, ON');
  });

  it('handles dining service tags', () => {
    expect(stripServiceTags('[Eat-In, Take-Out] [Eat-In, Take-Out] Brunch')).toBe('Brunch');
    expect(stripServiceTags('[Dine-In Only] Brunch')).toBe('Brunch');
    expect(parseServiceTypes('[Eat-In, Take-Out] Brunch', '')).toEqual(['Eat In', 'Take Out']);
    expect(parseServiceTypes('[Delivery] Wings', 'Eat in too')).toEqual(['Delivery']);
    expect(parseServiceTypes('Patio seating', 'We deliver daily')).toEqual(['Delivery']);
    expect(parseServiceTypes('Reheating tips', '')).toEqual([]);
    expect(serviceTypesFor({ service_options: [] , title: '[Eat-In] X' })).toEqual([]);
    expect(serviceTypesFor({ service_options: ['Delivery', 'Eat In'] })).toEqual(['Eat In', 'Delivery']);
    expect(serviceTypesFor({ title: '[Take-Out] Wings' })).toEqual(['Take Out']);
  });

  it('only allows http(s) links', () => {
    expect(safeHref('https://route48.ca')).toBe('https://route48.ca');
    expect(safeHref('javascript:alert(1)')).toBe('#');
    expect(safeHref('')).toBe('#');
  });
});
