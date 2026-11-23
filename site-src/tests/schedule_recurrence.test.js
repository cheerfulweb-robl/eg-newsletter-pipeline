import { describe, it, expect } from 'vitest';
import { parseEventOffsets, matchEventToCalendarDay, parseMonthlyNthRule, matchesMonthlyNthRule } from '../src/services/discoveryService.js';
import { computeSchedule, emptySchedule, scheduleFromRow, rangeSpanDays } from '../src/components/submission/submissionLogic.js';

const todayMid = new Date(2026, 10, 18, 0, 0, 0, 0); // Wed Nov 18, 2026

function day(y, m, d) {
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  const off = Math.round((dt.getTime() - todayMid.getTime()) / 86400000);
  return [dt, off];
}

describe('monthly nth-weekday and multiple dates calendar matching', () => {
  it('parses "3rd Thursday of every month" and matches ONLY the 3rd Thursday', () => {
    const rule = parseMonthlyNthRule('3rd Thursday of every month');
    expect(rule).toEqual({ nth: 3, weekday: 4 });
    // Nov 2026: Thu 5 (1st), Thu 12 (2nd), Thu 19 (3rd), Thu 26 (4th)
    expect(matchesMonthlyNthRule(new Date(2026, 10, 19), rule)).toBe(true);
    expect(matchesMonthlyNthRule(new Date(2026, 10, 20), rule)).toBe(false);
    expect(matchesMonthlyNthRule(new Date(2026, 10, 26), rule)).toBe(false);
    // Dec 2026: Thu 3 (1st), Thu 10 (2nd), Thu 17 (3rd)
    expect(matchesMonthlyNthRule(new Date(2026, 11, 17), rule)).toBe(true);
    expect(matchesMonthlyNthRule(new Date(2026, 11, 18), rule)).toBe(false);
  });

  it('shows Mindful Making (3rd Thursday) ONLY on 3rd Thursdays, not every day in between', () => {
    const evt = {
      title: 'Mindful Making',
      date_type: 'recurring',
      recurrence_rule: '3rd Thursday of every month',
      event_start_date: '2026-11-19',
      expires_after: '2027-03-18',
      event_date_label: 'Every 3rd Thursday of the month until 18 Mar 2027 • 6:00 PM - 8:00 PM',
    };
    const item = { ...evt, ...parseEventOffsets(evt, todayMid) };
    expect(matchEventToCalendarDay(item, ...day(2026, 11, 19))).toBe(true);  // 3rd Thu Nov
    expect(matchEventToCalendarDay(item, ...day(2026, 11, 20))).toBe(false); // Fri Nov 20
    expect(matchEventToCalendarDay(item, ...day(2026, 11, 26))).toBe(false); // 4th Thu Nov
    expect(matchEventToCalendarDay(item, ...day(2026, 12, 17))).toBe(true);  // 3rd Thu Dec
  });

  it('shows Multiple Dates ONLY on its exact listed dates, never days in between', () => {
    const evt = {
      title: 'Workshop Series',
      date_type: 'multiple',
      recurrence_rule: JSON.stringify([{ date: '2026-11-19' }, { date: '2026-12-17' }]),
      event_start_date: '2026-11-19',
      expires_after: '2026-12-17',
    };
    const item = { ...evt, ...parseEventOffsets(evt, todayMid) };
    expect(matchEventToCalendarDay(item, ...day(2026, 11, 19))).toBe(true);
    expect(matchEventToCalendarDay(item, ...day(2026, 11, 20))).toBe(false);
    expect(matchEventToCalendarDay(item, ...day(2026, 12, 10))).toBe(false);
    expect(matchEventToCalendarDay(item, ...day(2026, 12, 17))).toBe(true);
  });

  it('computes and round-trips monthly recurring schedule from a DB row', () => {
    const s = {
      ...emptySchedule('event'),
      dateType: 'recurring',
      recurringMode: 'monthly',
      recurringNth: '3rd',
      recurringMonthDay: 'Thu',
      recurringStartDate: '2026-11-19',
      recurringEndDate: '2027-03-18',
      recurringStartTime: '6:00 PM',
      recurringEndTime: '8:00 PM',
    };
    const out = computeSchedule('event', s, '2026-11-18');
    expect(out.error).toBeUndefined();
    expect(out.dateType).toBe('recurring');
    expect(out.recurrenceRule).toBe('3rd Thursday of every month');
    expect(out.label).toContain('3rd Thursday');

    const back = scheduleFromRow({
      date_type: out.dateType,
      recurrence_rule: out.recurrenceRule,
      event_start_date: out.startDate,
      expires_after: out.expiresAfter,
      event_date_label: out.label,
    }, 'event');
    expect(back.dateType).toBe('recurring');
    expect(back.recurringMode).toBe('monthly');
    expect(back.recurringNth).toBe('3rd');
    expect(back.recurringMonthDay).toBe('Thu');
  });

  it('measures date range span accurately for long-range warnings', () => {
    expect(rangeSpanDays('2026-11-19', '2026-11-21')).toBe(3);
    expect(rangeSpanDays('2026-11-19', '2026-12-19')).toBe(31);
  });
});
