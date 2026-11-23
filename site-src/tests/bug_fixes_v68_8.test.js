import { describe, it, expect } from 'vitest';
import {
  isListingExpired,
  formatEventScheduleDisplay,
  formatCategoryLabel,
} from '../src/services/discoveryService';

describe('v68.8 bug fixes', () => {
  it('maps legacy theatre_events to Concerts & Shows', () => {
    expect(formatCategoryLabel('theatre_events')).toBe('Concerts & Shows');
    expect(formatCategoryLabel('concerts_shows')).toBe('Concerts & Shows');
  });

  it('detects expired non-recurring events even when expires_after is null', () => {
    expect(isListingExpired({ event_start_date: '2020-01-15', expires_after: null })).toBe(true);
    expect(isListingExpired({ event_start_date: '2099-01-15', expires_after: null })).toBe(false);
    expect(
      isListingExpired({
        date_type: 'multiple',
        recurrence_rule: JSON.stringify([{ date: '2020-01-10' }, { date: '2020-01-17' }]),
      })
    ).toBe(true);
    expect(
      isListingExpired({
        date_type: 'recurring',
        recurrence_rule: 'Every Thursday',
        event_start_date: '2020-01-01',
        expires_after: null,
      })
    ).toBe(false);
  });

  it('shows actual event dates instead of generic "Recurring times and dates"', () => {
    const label = formatEventScheduleDisplay({
      event_date_label: 'Recurring times and dates',
      event_start_date: '2026-11-19',
      expires_after: '2026-12-10',
    });
    expect(label).toContain('19-Nov-2026');
    expect(label).toContain('10-Dec-2026');

    const multi = formatEventScheduleDisplay({
      event_date_label: 'Recurring times and dates',
      date_type: 'multiple',
      recurrence_rule: JSON.stringify([{ date: '2026-11-19' }, { date: '2026-11-26' }]),
    });
    expect(multi).toBe('19-Nov-2026, 26-Nov-2026');
  });
});
