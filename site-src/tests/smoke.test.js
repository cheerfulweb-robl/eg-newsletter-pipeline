import { describe, it, expect, beforeAll } from 'vitest';
import { 
  getTorontoTodayMidnight, 
  parseToMidnight, 
  formatDDMonthYYYY, 
  generateSlug, 
  isItemSaved, 
  toggleSaveItem,
  formatPhoneNumber,
  getWeekendRange,
  isThisWeekend,
  isNextWeekend
} from '../src/services/discoveryService';

describe('welcomegeorgina base configuration', () => {
  beforeAll(() => {
    const store = {};
    globalThis.localStorage = {
      getItem: (key) => store[key] || null,
      setItem: (key, val) => { store[key] = String(val); },
      removeItem: (key) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); }
    };
  });

  it('correctly calculates Toronto midnight time', () => {
    const today = getTorontoTodayMidnight();
    expect(today).toBeDefined();
    expect(today.getHours()).toBe(0);
    expect(today.getMinutes()).toBe(0);
    expect(today.getSeconds()).toBe(0);
  });

  it('correctly parses dates to midnight', () => {
    const d1 = parseToMidnight('2026-11-07');
    expect(d1).toBeDefined();
    expect(d1.getFullYear()).toBe(2026);
    expect(d1.getMonth()).toBe(10); // Nov is 10
    expect(d1.getDate()).toBe(7);
  });

  it('correctly formats dates as DD-Month-YYYY', () => {
    expect(formatDDMonthYYYY('2026-11-07')).toBe('07-Nov-2026');
    expect(formatDDMonthYYYY('2026-05-01')).toBe('01-May-2026');
    expect(formatDDMonthYYYY(null)).toBe('');
  });

  it('correctly generates URL slugs', () => {
    const slug = generateSlug('Farmers Market & Craft Fair', 'The Link, Sutton');
    expect(slug).toBe('farmers-market-craft-fair-the-link-sutton');
  });

  it('handles item saving state in localStorage', () => {
    const item = { id: 'test-123', title: 'Test Event' };
    
    // Toggle save on
    const saved = toggleSaveItem(item, 'event');
    expect(saved).toBe(true);
    expect(isItemSaved('test-123')).toBe(true);

    // Toggle save off
    const unsaved = toggleSaveItem(item, 'event');
    expect(unsaved).toBe(false);
    expect(isItemSaved('test-123')).toBe(false);
  });

  it('formats Canadian phone numbers correctly', () => {
    expect(formatPhoneNumber('9051234567')).toBe('(905) 123-4567');
    expect(formatPhoneNumber('(905) 123-4567')).toBe('(905) 123-4567');
    expect(formatPhoneNumber('')).toBe('');
  });

  it('correctly calculates dynamic This Weekend range dropping past days and calculates Next Weekend', () => {
    // Test This Weekend
    const thisWknd = getWeekendRange('this');
    expect(thisWknd).toBeDefined();
    expect(thisWknd.days).toBeDefined();
    expect(thisWknd.label).toBeDefined();

    // Dates relative to today (Toronto), so the test works in any week
    const today = getTorontoTodayMidnight();
    const nowDay = today.getDay();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const plus = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
    // Friday of this weekend (on Sat/Sun it is the Friday just past)
    const fri = plus(nowDay === 6 ? -1 : nowDay === 0 ? -2 : 5 - nowDay);
    const sat = new Date(fri); sat.setDate(fri.getDate() + 1);
    const sun = new Date(fri); sun.setDate(fri.getDate() + 2);
    // Friday is only active on or before Friday; on Saturday and Sunday it is in the past
    expect(isThisWeekend(iso(fri))).toBe(nowDay !== 6 && nowDay !== 0);
    expect(isThisWeekend(iso(sat))).toBe(nowDay !== 0);
    expect(isThisWeekend(iso(sun))).toBe(true);

    // Test Next Weekend
    const nextWknd = getWeekendRange('next');
    expect(nextWknd.days).toEqual(['All', 'Friday', 'Saturday', 'Sunday']);
    const nextFri = new Date(fri); nextFri.setDate(fri.getDate() + 7);
    const nextSat = new Date(fri); nextSat.setDate(fri.getDate() + 8);
    expect(isNextWeekend(iso(nextFri))).toBe(true);
    expect(isNextWeekend(iso(nextSat))).toBe(true);
    const nextSun = new Date(fri); nextSun.setDate(fri.getDate() + 9);
    expect(isNextWeekend(iso(nextSun))).toBe(true);
    expect(isNextWeekend(iso(plus(-14)))).toBe(false);
  });
});
