import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import ListingSubmissionForm from '../src/components/submission/ListingSubmissionForm.jsx';
import {
  buildPayload,
  cleanTitle,
  computeSchedule,
  emptySchedule,
  validateFields
} from '../src/components/submission/submissionLogic.js';

const TODAY = '2026-11-15';

const baseFields = {
  title: 'Holiday Market',
  businessName: 'East Gwillimbury Arts',
  eventCategory: 'markets',
  saleCategory: 'Retail',
  serviceOptions: [],
  priceText: '20% Off',
  location: '20849 Dalton Rd',
  community: 'Sutton',
  link: '',
  summary: 'Crafts and food',
  imageUrl: '',
  hamperContact: false,
  firstName: 'Shelley',
  lastName: 'Smith',
  email: 'Shelley@Example.ca',
  phone: '(905) 728-4196',
  agreePrivacy: true,
  agreeTerms: true
};

function render(kind) {
  return renderToString(
    <MemoryRouter>
      <ListingSubmissionForm kind={kind} />
    </MemoryRouter>
  );
}

describe('shared submission form', () => {
  it('shows the same core fields in the same order for every kind', () => {
    const order = [
      'Event Schedule Pattern',
      'Community Area',
      'Website Link',
      'Monday newsletter',
      'Thursday newsletter',
      'Please send me information about the Welcome Hamper',
      'First Name',
      'Last Name',
      'Contact Email',
      'Contact Phone Number',
      'Required Legal Affirmations'
    ];
    for (const kind of ['event', 'dining', 'sale']) {
      const html = render(kind);
      let last = -1;
      for (const label of order) {
        const at = html.indexOf(label);
        expect(at, `${kind}: ${label}`).toBeGreaterThan(last);
        last = at;
      }
      for (const p of ['Single Day', 'Date Range', 'Multiple Dates', 'Recurring']) expect(html).toContain(p);
    }
  });

  it('shows Category for events and sales only, and service options for dining only', () => {
    expect(render('event')).toContain('event-category');
    expect(render('sale')).toContain('sale-category');
    const dining = render('dining');
    expect(dining).not.toContain('>Category');
    expect(dining).toContain('Service Options');
    expect(render('event')).not.toContain('Service Options');
  });

  it('strips leading bracket tags from titles', () => {
    expect(cleanTitle('[Sale] [Eat-In, Take-Out]  Wing Night ')).toBe('Wing Night');
    expect(cleanTitle('Wing Night [Fridays]')).toBe('Wing Night [Fridays]');
  });

  it('computes every schedule pattern with a start date', () => {
    const one = computeSchedule('event', { ...emptySchedule('event'), dateType: 'one_time', singleDate: '2026-12-01', singleStartTime: '10:00 AM', singleEndTime: '2:00 PM' }, TODAY);
    expect(one).toMatchObject({ dateType: 'one_time', startDate: '2026-12-01', expiresAfter: '2026-12-01', recurrenceRule: null });
    expect(one.label).toContain('10:00 AM - 2:00 PM');

    const range = computeSchedule('sale', { ...emptySchedule('sale'), dateType: 'date_range', rangeStartDate: '2026-12-01', rangeEndDate: '2026-12-07' }, TODAY);
    expect(range).toMatchObject({ dateType: 'date_range', startDate: '2026-12-01', expiresAfter: '2026-12-07' });
    expect(range.label).toContain(' to ');
    expect(computeSchedule('sale', { ...emptySchedule('sale'), dateType: 'date_range', rangeStartDate: '2026-12-07', rangeEndDate: '2026-12-01' }, TODAY).error).toBeTruthy();

    const multi = computeSchedule('event', {
      ...emptySchedule('event'),
      dateType: 'multiple',
      multiDates: [{ date: '2026-12-09', startTime: '1:00 PM', endTime: '' }, { date: '2026-12-02', startTime: '10:00 AM', endTime: '' }, { date: '' }]
    }, TODAY);
    expect(multi).toMatchObject({ dateType: 'multiple', startDate: '2026-12-02', expiresAfter: '2026-12-09' });
    expect(JSON.parse(multi.recurrenceRule)).toHaveLength(2);

    const rec = computeSchedule('dining', { ...emptySchedule('dining'), dateType: 'recurring', recurringDays: ['Wed', 'Mon'] }, TODAY);
    expect(rec).toMatchObject({ dateType: 'recurring', startDate: TODAY, expiresAfter: null, recurrenceRule: 'Monday, Wednesday' });
    expect(rec.label).toBe('Every Monday, Wednesday');
  });

  it('requires a recurring end date for sales only', () => {
    const s = { ...emptySchedule('sale'), dateType: 'recurring', recurringDays: ['Sat'] };
    expect(computeSchedule('sale', s, TODAY).error).toBeTruthy();
    expect(computeSchedule('event', s, TODAY).error).toBeUndefined();
    expect(computeSchedule('sale', { ...s, recurringEndDate: '2026-12-31' }, TODAY).expiresAfter).toBe('2026-12-31');
  });

  it('validates phone, link and required fields', () => {
    expect(validateFields('event', baseFields)).toBeNull();
    expect(validateFields('event', { ...baseFields, phone: '(905) 123-4567' }).field).toBe('phone');
    expect(validateFields('event', { ...baseFields, link: 'not a link' }).field).toBe('link');
    expect(validateFields('event', { ...baseFields, community: '' }).field).toBe('community');
    expect(validateFields('sale', { ...baseFields, saleCategory: '' }).field).toBe('category');
    expect(validateFields('sale', { ...baseFields, priceText: ' ' }).field).toBe('priceText');
    expect(validateFields('dining', { ...baseFields, agreeTerms: false }).field).toBe('agreements');
  });

  it('builds the stored row for each kind', () => {
    const schedule = { dateType: 'one_time', startDate: '2026-12-01', expiresAfter: '2026-12-01', label: '01 December 2026', recurrenceRule: null };
    const common = { id: 'x', status: 'pending_verification', slug: 's', schedule };

    const ev = buildPayload({ ...common, kind: 'event', fields: { ...baseFields, title: '[Sale] Market', community: 'All East Gwillimbury' } });
    expect(ev.title).toBe('Market');
    expect(ev.category).toBe('markets');
    expect(ev.community).toBe('East Gwillimbury');
    expect(ev.submitter_email).toBe('shelley@example.ca');
    expect(ev.link).toBe('https://welcomeeg.ca/events');
    expect(ev).not.toHaveProperty('hamper_contact');
    expect(ev).not.toHaveProperty('service_options');

    const din = buildPayload({ ...common, kind: 'dining', fields: { ...baseFields, serviceOptions: ['Delivery', 'Eat In'], hamperContact: true } });
    expect(din.category).toBe('dining');
    expect(din.service_options).toEqual(['Eat In', 'Delivery']);
    expect(din.hamper_contact).toBe(true);
    expect(din.link).toBe('https://welcomeeg.ca/dining');
    expect(buildPayload({ ...common, kind: 'dining', fields: baseFields }).service_options).toEqual([]);

    const sale = buildPayload({ ...common, kind: 'sale', fields: { ...baseFields, link: 'yourstore.ca/sale' } });
    expect(sale.category).toBe('special_sale');
    expect(sale.sale_category).toBe('Retail');
    expect(sale.price_text).toBe('20% Off');
    expect(sale.title).toBe('Holiday Market');
    expect(sale.link).toBe('https://yourstore.ca/sale');
    expect(sale.location).toBe('20849 Dalton Rd, East Gwillimbury, ON');
  });
});
