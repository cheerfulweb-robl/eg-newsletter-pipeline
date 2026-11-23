import { describe, it, expect } from 'vitest';
import { buildDuplicateCheckParams } from '../src/components/submission/submissionLogic';

describe('submissionLogic duplicate helpers', () => {
  it('formats duplicate check params cleanly', () => {
    const fields = {
      title: ' [Sale] [Eat-In]  Summer Music Festival 2026 ',
      businessName: 'Town of East Gwillimbury',
      location: '123 Main Street',
      community: 'Jackson\'s Point',
      link: 'https://www.example.com/festival/?ref=fb',
      email: ' Organizer@Example.com '
    };
    const schedule = {
      startDate: '2026-07-15',
      expiresAfter: '2026-07-16'
    };

    const params = buildDuplicateCheckParams('event', fields, schedule);

    expect(params.p_title).toBe('Summer Music Festival 2026');
    expect(params.p_start_date).toBe('2026-07-15');
    expect(params.p_end_date).toBe('2026-07-16');
    expect(params.p_location).toBe('123 Main Street');
    expect(params.p_community).toBe('Jackson\'s Point');
    expect(params.p_link).toBe('https://www.example.com/festival/?ref=fb');
    expect(params.p_email).toBe('organizer@example.com');
    expect(params.p_kind).toBe('event');
  });

  it('handles null schedule dates and default communities gracefully', () => {
    const fields = {
      title: 'Farmers Market',
      location: 'ClearWater Farm',
      community: 'All East Gwillimbury',
      link: '',
      email: 'farmer@eg.ca'
    };

    const params = buildDuplicateCheckParams('sale', fields, null);

    expect(params.p_title).toBe('Farmers Market');
    expect(params.p_start_date).toBeNull();
    expect(params.p_end_date).toBeNull();
    expect(params.p_community).toBe('East Gwillimbury');
    expect(params.p_link).toBeNull();
    expect(params.p_email).toBe('farmer@eg.ca');
  });
});
