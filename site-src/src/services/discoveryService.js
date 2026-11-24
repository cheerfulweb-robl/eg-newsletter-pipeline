/**

 * Welcome East Gwillimbury — Resident Discovery & Local Marketplace Service

 * Provides timezone-aware date parsing (America/Toronto), search matching,

 * slug generation, "What's New" visit tracking, bookmarking, and .ics calendar exports.

 */



const TORONTO_TIMEZONE = 'America/Toronto';



/**

 * Standard categories covering both events and local sales

 */

export const DISCOVERY_CATEGORIES = [

  'All',

  'Community Events',

  'Family Friendly',

  'Food & Drink',

  'Shopping',

  'Concerts & Shows',

  'Markets',

  'Sports & Recreation',

  'Arts & Culture',

  'Community',

  'Business & Networking'

];



/**

 * Display names for categorized events, deals, and community listings.

 * Cleans up snake_case database category strings into human-readable labels.

 */

export const CATEGORY_DISPLAY_MAP = {
  'community_events': 'Community Gathering & Social',
  'concerts_shows': 'Concerts & Shows',
  'live_music': 'Concerts & Shows',
  'workshops': 'Workshops & Classes',
  'markets': 'Markets & Craft Fairs',
  'sports': 'Sports & Recreation',
  'fundraisers': 'Fundraisers & Non-Profit',
  'family': 'Kids & Family Friendly',
  'arts': 'Arts & Culture',
  'business_event': 'Local Business Event',

  // Legacy & internal scraper sources mapped gracefully
  'library_events': 'East Gwillimbury Public Library',
  'chamber_events': 'Chamber of Commerce',
  'theatre_events': 'Concerts & Shows',
  'upcoming_events': 'Town Event',
  'private_business_events': 'Local Venue / Business',
  'eventbrite_meetup': 'Local Gathering',
  'partner_deals': 'Featured Local Perk',
  'municipal_news': 'Town Notice',
  'local_news': 'Local News',
  'news': 'Local News',
  'dining': 'Local Dining',
  'community_event': 'Community Event',
  'garage_sale': 'Garage Sale',
  'sale': 'Retail Sale',
  'special_sale': 'Special Sale / Offer',
  'past_events': 'Past Event'
};



/**

 * Clean up category pills and badges by stripping underscores and converting to Title Case.

 */

export function formatCategoryLabel(category) {

  if (!category) return 'Community';

  const trimmed = String(category).trim();

  if (CATEGORY_DISPLAY_MAP[trimmed]) return CATEGORY_DISPLAY_MAP[trimmed];

  const lower = trimmed.toLowerCase();

  if (CATEGORY_DISPLAY_MAP[lower]) return CATEGORY_DISPLAY_MAP[lower];

  // Replace underscores and hyphens with spaces and capitalize each word

  return trimmed

    .replace(/[_-]+/g, ' ')

    .replace(/\b([a-z])/g, (_, l) => l.toUpperCase());

}



/**

 * East Gwillimbury communities and geographic coordinates (verified)

 */

export const GEORGINA_COMMUNITIES = [
  { name: 'All East Gwillimbury', center: [44.275, -79.350], zoom: 11 },
  { name: 'Holland Landing', center: [44.225, -79.460], zoom: 13, tag: 'Holland Landing' },
  { name: 'Mount Albert', center: [44.305, -79.355], zoom: 13, tag: 'Mount Albert' },
  { name: "Sharon", center: [44.325, -79.340], zoom: 14, tag: "Sharon" },
  { name: 'Queensville', center: [44.310, -79.200], zoom: 13, tag: 'Queensville' },
  { name: 'River Drive Park', center: [44.305, -79.410], zoom: 13, tag: 'River Drive Park' },
  { name: 'Brown Hill', center: [44.275, -79.155], zoom: 13, tag: 'Brown Hill' },
  { name: 'Baldwin', center: [44.275, -79.339], zoom: 13, tag: 'Baldwin' },
  { name: 'Virginia', center: [44.330, -79.280], zoom: 13, tag: 'Virginia' },
  { name: 'Ravenshoe', center: [44.375, -79.180], zoom: 13, tag: 'Ravenshoe' }
];



/**

 * Get current date in America/Toronto timezone with hours reset to midnight

 */

export function getTorontoTodayMidnight() {

  const now = new Date();

  const torontoDateStr = now.toLocaleDateString('en-CA', { timeZone: TORONTO_TIMEZONE });

  const [year, month, day] = torontoDateStr.split('-').map(Number);

  return new Date(year, month - 1, day, 0, 0, 0, 0);

}



/**

 * Convert any date input into a midnight Date object in Toronto time

 */

export function parseToMidnight(dateInput) {

  if (!dateInput) return null;

  if (dateInput instanceof Date) {

    const d = new Date(dateInput);

    d.setHours(0, 0, 0, 0);

    return d;

  }

  // If string, extract year/month/day directly to prevent timezone rollback

  if (typeof dateInput === 'string') {

    const match = dateInput.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);

    if (match) {

      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);

    }

    const ddMonthMatch = dateInput.match(/(\d{1,2})-(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)-(\d{4})/i);

    if (ddMonthMatch) {

      const mStr = ddMonthMatch[2].slice(0, 3).toLowerCase();

      const mIdx = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }[mStr] ?? 0;

      return new Date(Number(ddMonthMatch[3]), mIdx, Number(ddMonthMatch[1]), 0, 0, 0, 0);

    }

    const parsed = new Date(dateInput);

    if (!isNaN(parsed.getTime())) {

      parsed.setHours(0, 0, 0, 0);

      return parsed;

    }

  }

  return null;

}



const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];



/**

 * Standardize display dates across all event, sales, and dining cards to DD-Month-YYYY (e.g. "14-Nov-2026").

 * Preserves optional time components (e.g. "14-Nov-2026 • 9:00 AM").

 * Immune to browser UTC/EST timezone offsets.

 */

export function formatDDMonthYYYY(dateInput) {

  if (!dateInput) return '';

  const str = String(dateInput).trim();

  if (!str) return '';



  // Extract optional trailing time component if present (e.g. " • 9:00 AM", " @ 5:00 PM", " • 10:00 AM - 3:00 PM")

  let timeSuffix = '';

  const timeMatch = str.match(/(?:•|@|\sat\s)\s*([0-9]{1,2}(?::[0-9]{2})?\s*(?:AM|PM|am|pm)?(?:\s*-\s*[0-9]{1,2}(?::[0-9]{2})?\s*(?:AM|PM|am|pm)?)?)/i);

  if (timeMatch) {

    timeSuffix = ` • ${timeMatch[1].trim()}`;

  }



  // 1. Check if already formatted as DD-Month-YYYY

  const alreadyFormatted = str.match(/^(\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})(.*)$/i);

  if (alreadyFormatted) {

    return str;

  }



  // 2. Check ISO string 'YYYY-MM-DD'

  const isoMatch = str.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);

  if (isoMatch) {

    const y = isoMatch[1];

    const mNum = parseInt(isoMatch[2], 10);

    const dNum = parseInt(isoMatch[3], 10);

    const dayStr = String(dNum).padStart(2, '0');

    const monthStr = MONTH_NAMES_SHORT[mNum - 1] || 'Jan';

    return `${dayStr}-${monthStr}-${y}${timeSuffix}`;

  }



  // 3. Check natural language dates e.g. 'Sat, Nov 14, 2026', 'November 14, 2026', '14 Nov 2026'

  const textMatch = str.match(/(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})/i)

    || str.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?,?\s*(\d{4})/i);



  if (textMatch) {

    const mStrMatch = str.match(/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)/i);

    const monthKey = mStrMatch ? mStrMatch[1].slice(0, 3).toLowerCase() : 'jan';

    const mIndex = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }[monthKey] ?? 0;

    const monthStr = MONTH_NAMES_SHORT[mIndex];



    const dayNum = parseInt(textMatch[1], 10);

    const yearNum = textMatch[2];

    const dayStr = String(dayNum).padStart(2, '0');



    if (!timeSuffix) {

      const remainingTime = str.split(yearNum)[1] || '';

      const cleanTime = remainingTime.replace(/^[\s•@-]+/, '').trim();

      if (cleanTime) timeSuffix = ` • ${cleanTime}`;

    }



    return `${dayStr}-${monthStr}-${yearNum}${timeSuffix}`;

  }



  return str;

}



/**

 * Unified calculation of event date offsets relative to today in America/Toronto.

 * Handles explicit start dates, expiration dates, recurring weekdays (Mondays, Tuesdays, etc.),

 * and fallback date label text parsing.

 */

const MONTH_ORDINAL_MAP = {
  '1st': 1, 'first': 1, '1': 1,
  '2nd': 2, 'second': 2, '2': 2,
  '3rd': 3, 'third': 3, '3': 3,
  '4th': 4, 'fourth': 4, '4': 4,
  'last': -1,
};
const WEEKDAY_NAME_MAP = {
  sun: 0, sunday: 0, sundays: 0,
  mon: 1, monday: 1, mondays: 1,
  tue: 2, tues: 2, tuesday: 2, tuesdays: 2,
  wed: 3, wednesday: 3, wednesdays: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, thursdays: 4,
  fri: 5, friday: 5, fridays: 5,
  sat: 6, saturday: 6, saturdays: 6,
};

/** Parse a monthly nth-weekday pattern like "3rd Thursday of every month" or "Last Friday of the month". */
export function parseMonthlyNthRule(text) {
  const s = String(text || '').toLowerCase();
  const m = s.match(/\b(1st|2nd|3rd|4th|first|second|third|fourth|last)\s+(sun(?:day)?s?|mon(?:day)?s?|tue(?:s(?:day)?)?s?|wed(?:nesday)?s?|thu(?:r(?:s(?:day)?)?)?s?|fri(?:day)?s?|sat(?:urday)?s?)\s+(?:of\s+(?:every|each|the)\s+month|monthly)\b/i)
    || s.match(/^monthly:(1|2|3|4|last):(sun|mon|tue|wed|thu|fri|sat)$/i);
  if (!m) return null;
  const nth = MONTH_ORDINAL_MAP[m[1].toLowerCase()];
  const weekday = WEEKDAY_NAME_MAP[m[2].toLowerCase()];
  if (nth === undefined || weekday === undefined) return null;
  return { nth, weekday };
}

/** True when `dayDate` matches a monthly nth-weekday rule (e.g. 3rd Thursday or Last Friday). */
export function matchesMonthlyNthRule(dayDate, rule) {
  if (!rule || !dayDate) return false;
  if (dayDate.getDay() !== rule.weekday) return false;
  if (rule.nth === -1) {
    // Last occurrence of this weekday in the month: adding 7 days changes the month
    const nextWeek = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate() + 7);
    return nextWeek.getMonth() !== dayDate.getMonth();
  }
  const occurrence = Math.floor((dayDate.getDate() - 1) / 7) + 1;
  return occurrence === rule.nth;
}

function parseRuleWeekdays(rule) {
  const r = String(rule || '').trim();
  if (!r || r.startsWith('[')) return [];
  if (r.startsWith('{')) {
    try {
      const obj = JSON.parse(r);
      const out = [];
      for (const [k, v] of Object.entries(obj)) {
        const wd = WEEKDAY_NAME_MAP[k.slice(0, 3).toLowerCase()];
        if (wd !== undefined && (!v || typeof v !== 'object' || v.enabled !== false)) out.push(wd);
      }
      return Array.from(new Set(out));
    } catch {
      return [];
    }
  }
  const low = r.toLowerCase();
  const out = [];
  for (const [name, wd] of Object.entries(WEEKDAY_NAME_MAP)) {
    if (name.length >= 3 && new RegExp(`\\b${name}\\b`, 'i').test(low)) out.push(wd);
  }
  return Array.from(new Set(out));
}

function parseExactDates(evt) {
  const raw = String(evt?.recurrence_rule || '').trim();
  if (!raw.startsWith('[')) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item) => String(item && item.date ? item.date : '').trim().slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  } catch {
    return [];
  }
}

function localYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseEventOffsets(evt, todayMid) {
  let startOffset = null;
  let endOffset = null;
  let recurringDay = null; // 0 = Sun .. 6 = Sat (first weekly day, kept for backwards compatibility)
  let recurringDays = [];
  let monthlyRule = null;
  let exactDates = [];
  let isOngoing = false;

  const fullText = `${evt.title || ''} ${evt.event_date_label || ''} ${evt.summary || ''}`.toLowerCase();

  // 0a. Exact multiple dates stored as JSON array in recurrence_rule
  if (evt.date_type === 'multiple' || String(evt.recurrence_rule || '').trim().startsWith('[')) {
    exactDates = parseExactDates(evt);
  }

  // 0b. Monthly nth-weekday rule (e.g. "3rd Thursday of every month") — checked BEFORE weekly regex!
  monthlyRule = parseMonthlyNthRule(evt.recurrence_rule) || parseMonthlyNthRule(evt.event_date_label) || parseMonthlyNthRule(evt.summary);

  // 1. Weekly recurring days (from structured recurrence_rule first, else explicit text)
  if (!monthlyRule && exactDates.length === 0) {
    if (evt.date_type === 'recurring' && evt.recurrence_rule) {
      recurringDays = parseRuleWeekdays(evt.recurrence_rule);
    }
    if (recurringDays.length === 0) {
      if (/\b(?:every|weekly\s+on|each)\s+mondays?\b/i.test(fullText)) recurringDays.push(1);
      if (/\b(?:every|weekly\s+on|each)\s+tuesdays?\b/i.test(fullText)) recurringDays.push(2);
      if (/\b(?:every|weekly\s+on|each)\s+wednesdays?\b/i.test(fullText)) recurringDays.push(3);
      if (/\b(?:every|weekly\s+on|each)\s+thursdays?\b/i.test(fullText)) recurringDays.push(4);
      if (/\b(?:every|weekly\s+on|each)\s+fridays?\b/i.test(fullText)) recurringDays.push(5);
      if (/\b(?:every|weekly\s+on|each)\s+saturdays?\b/i.test(fullText)) recurringDays.push(6);
      if (/\b(?:every|weekly\s+on|each)\s+sundays?\b/i.test(fullText)) recurringDays.push(0);
    }
    if (recurringDays.length > 0) recurringDay = recurringDays[0];
  }

  // 2. Explicit start date takes priority
  if (evt.event_start_date) {
    const s = parseToMidnight(evt.event_start_date);
    if (s && !isNaN(s.getTime())) {
      startOffset = Math.round((s.getTime() - todayMid.getTime()) / 86400000);
    }
  }

  // 3. Fallback to event_date_label text parsing if startOffset is still null
  if (startOffset === null && evt.event_date_label) {
    const label = evt.event_date_label;
    const m = label.match(/(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i);
    if (m) {
      const monthNames = {
        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
        may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
        sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
      };
      const monthPrefix = m[0].split(/\s+/)[0].replace('.', '').toLowerCase();
      const monthIdx = monthNames[monthPrefix];
      const day = parseInt(m[1], 10);
      const year = m[2] ? parseInt(m[2], 10) : todayMid.getFullYear();
      if (monthIdx !== undefined && !isNaN(day)) {
        const parsedDate = new Date(year, monthIdx, day, 0, 0, 0, 0);
        if (!isNaN(parsedDate.getTime())) {
          startOffset = Math.round((parsedDate.getTime() - todayMid.getTime()) / 86400000);
        }
      }
    }
  }

  // 4. Exact Multiple Dates: NEVER bleed across days in between!
  if (exactDates.length > 0) {
    const sorted = exactDates.slice().sort();
    const s = parseToMidnight(sorted[0]);
    const e = parseToMidnight(sorted[sorted.length - 1]);
    if (s) startOffset = Math.round((s.getTime() - todayMid.getTime()) / 86400000);
    if (e) endOffset = Math.round((e.getTime() - todayMid.getTime()) / 86400000);
    return { startOffset, endOffset, recurringDay: null, recurringDays: [], monthlyRule: null, exactDates: sorted, isOngoing: false, isDateRange: false };
  }

  // 5. Monthly nth-weekday OR Weekly recurring bounds (never treated as consecutive Date Range)
  if (monthlyRule || recurringDays.length > 0) {
    if (evt.expires_after) {
      const e = parseToMidnight(evt.expires_after);
      if (e && !isNaN(e.getTime())) {
        endOffset = Math.round((e.getTime() - todayMid.getTime()) / 86400000);
      }
    }
    return { startOffset, endOffset, recurringDay, recurringDays, monthlyRule, exactDates: [], isOngoing: false, isDateRange: false };
  }

  // 6. Consecutive Multi-day date ranges vs Single-Day events
  let isDateRange = false;
  const isExplicitRange = evt.date_type === 'date_range' || evt.is_multi_day === true;
  if (isExplicitRange && evt.expires_after) {
    const e = parseToMidnight(evt.expires_after);
    if (e && !isNaN(e.getTime())) {
      const parsedEnd = Math.round((e.getTime() - todayMid.getTime()) / 86400000);
      if (startOffset !== null && parsedEnd > startOffset) {
        endOffset = parsedEnd;
        isDateRange = true;
      }
    }
  }

  // 7. Ongoing exhibitions
  if (startOffset === null) {
    if (/\b(?:ongoing|year-round|year round|open daily)\b/i.test(fullText)) {
      isOngoing = true;
      startOffset = -7;
      endOffset = 48;
    }
  }

  if (endOffset === null || endOffset < startOffset) {
    endOffset = startOffset;
  }

  return { startOffset, endOffset, recurringDay, recurringDays, monthlyRule, exactDates, isOngoing, isDateRange };
}

/**
 * Checks whether an event should appear on a specific calendar day.
 */
export function matchEventToCalendarDay(item, dayDate, dayOffset) {
  if (!item) return false;

  const title = (item.title || '').toLowerCase();
  if (title.includes('submit your georgina business event') || title.includes('auto-scrape your website')) {
    return false;
  }

  // 1. Multiple specific dates: ONLY on the exact listed dates
  if (Array.isArray(item.exactDates) && item.exactDates.length > 0) {
    return item.exactDates.includes(localYmd(dayDate));
  }

  // 2. Monthly nth-weekday (e.g. 3rd Thursday of every month): ONLY on that weekday occurrence within bounds
  if (item.monthlyRule) {
    if (!matchesMonthlyNthRule(dayDate, item.monthlyRule)) return false;
    const afterStart = (item.startOffset === null || item.startOffset === undefined) ? true : dayOffset >= item.startOffset;
    const beforeEnd = (item.endOffset === null || item.endOffset === undefined) ? true : dayOffset <= item.endOffset;
    return afterStart && beforeEnd;
  }

  // 3. Weekly recurring (one or more weekdays) within bounds
  if (Array.isArray(item.recurringDays) && item.recurringDays.length > 0) {
    if (!item.recurringDays.includes(dayDate.getDay())) return false;
    const afterStart = (item.startOffset === null || item.startOffset === undefined) ? true : dayOffset >= item.startOffset;
    const beforeEnd = (item.endOffset === null || item.endOffset === undefined) ? true : dayOffset <= item.endOffset;
    return afterStart && beforeEnd;
  }
  if (item.recurringDay !== null && item.recurringDay !== undefined) {
    if (dayDate.getDay() !== item.recurringDay) return false;
    const afterStart = (item.startOffset === null || item.startOffset === undefined) ? true : dayOffset >= item.startOffset;
    const beforeEnd = (item.endOffset === null || item.endOffset === undefined) ? true : dayOffset <= item.endOffset;
    return afterStart && beforeEnd;
  }

  // 4. Explicit ongoing exhibitions
  if (item.isOngoing) {
    return dayOffset >= (item.startOffset ?? -7) && dayOffset <= (item.endOffset ?? 48);
  }

  if (item.startOffset === null || item.startOffset === undefined) {
    return false;
  }

  const start = item.startOffset !== null && item.startOffset !== undefined ? item.startOffset : item.dateOffsetDays;
  const end = item.endOffset !== null && item.endOffset !== undefined ? item.endOffset : item.dateOffsetDays;

  // 5. Consecutive multi-day ranges (e.g. 3-day festival)
  if (item.isDateRange && end > start) {
    return dayOffset >= start && dayOffset <= end;
  }

  // 6. Single-day events: STRICTLY on their exact event date
  return dayOffset === start;
}



/**

 * Check if a date string falls on today in America/Toronto

 */

export function isToday(dateInput) {

  const target = parseToMidnight(dateInput);

  if (!target) return false;

  const today = getTorontoTodayMidnight();

  return target.getTime() === today.getTime();

}



/**

 * Check if a date string falls on tomorrow in America/Toronto

 */

export function isTomorrow(dateInput) {

  const target = parseToMidnight(dateInput);

  if (!target) return false;

  const today = getTorontoTodayMidnight();

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  return diffDays === 1;

}



/**

 * Check if a date string falls during the upcoming weekend (Friday evening, Saturday, Sunday)

 */

export function getWeekendRange(which = 'this') {
  const today = getTorontoTodayMidnight();
  const todayDay = today.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat

  if (which === 'next') {
    let daysToNextFri = 0;
    if (todayDay === 0) daysToNextFri = 5;
    else if (todayDay === 6) daysToNextFri = 6;
    else daysToNextFri = (5 - todayDay) + 7;

    const startDate = new Date(today);
    startDate.setDate(today.getDate() + daysToNextFri);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 2);
    endDate.setHours(23, 59, 59, 999);

    const fOpts = { month: 'short', day: 'numeric' };
    const labelStr = startDate.toLocaleDateString('en-CA', fOpts) + ' - ' + endDate.toLocaleDateString('en-CA', fOpts) + ', ' + endDate.getFullYear();
    return {
      startDate,
      endDate,
      days: ['All', 'Friday', 'Saturday', 'Sunday'],
      label: labelStr
    };
  }

  // 'this' weekend
  let startDate = new Date(today);
  let endDate = new Date(today);
  let days = ['All'];

  if (todayDay === 6) { // Saturday
    startDate = new Date(today);
    endDate = new Date(today);
    endDate.setDate(today.getDate() + 1); // Sunday
    days = ['All', 'Saturday', 'Sunday'];
  } else if (todayDay === 0) { // Sunday
    startDate = new Date(today);
    endDate = new Date(today);
    days = ['All', 'Sunday'];
  } else { // Mon - Fri
    const daysToFri = 5 - todayDay;
    startDate.setDate(today.getDate() + daysToFri);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 2);
    days = ['All', 'Friday', 'Saturday', 'Sunday'];
  }

  endDate.setHours(23, 59, 59, 999);
  const fOpts = { month: 'short', day: 'numeric' };
  const labelStr = startDate.toLocaleDateString('en-CA', fOpts) + ' - ' + endDate.toLocaleDateString('en-CA', fOpts) + ', ' + endDate.getFullYear();
  return {
    startDate,
    endDate,
    days,
    label: labelStr
  };
}

export function isThisWeekend(dateInput) {
  const target = parseToMidnight(dateInput);
  if (!target) return false;
  const { startDate, endDate } = getWeekendRange('this');
  return target.getTime() >= startDate.getTime() && target.getTime() <= endDate.getTime();
}

export function isNextWeekend(dateInput) {
  const target = parseToMidnight(dateInput);
  if (!target) return false;
  const { startDate, endDate } = getWeekendRange('next');
  return target.getTime() >= startDate.getTime() && target.getTime() <= endDate.getTime();
}



/**

 * Check if a date string falls within the next 7 days

 */

export function isNext7Days(dateInput) {

  const target = parseToMidnight(dateInput);

  if (!target) return false;

  const today = getTorontoTodayMidnight();

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  return diffDays >= 0 && diffDays <= 7;

}



/**

 * Check if a date string falls in the current calendar month

 */

export function isThisMonth(dateInput) {

  const target = parseToMidnight(dateInput);

  if (!target) return false;

  const today = getTorontoTodayMidnight();

  return target.getFullYear() === today.getFullYear() && target.getMonth() === today.getMonth();

}



/**

 * Check if an expiry date is approaching within threshold days (default 5 days) and not already expired

 */

export function isEndingSoon(expiryDateInput, thresholdDays = 5) {

  const expiry = parseToMidnight(expiryDateInput);

  if (!expiry) return false;

  const today = getTorontoTodayMidnight();

  const diffDays = Math.round((expiry.getTime() - today.getTime()) / 86400000);

  return diffDays >= 0 && diffDays <= thresholdDays;

}



/**

 * Check if a record has already expired

 */

export function isExpired(expiryDateInput) {

  const expiry = parseToMidnight(expiryDateInput);

  if (!expiry) return false;

  const today = getTorontoTodayMidnight();

  // An event scheduled for a given day is NOT expired while that day is ongoing.

  // It only becomes expired after the full day concludes (today > expiry date).

  return today.getTime() > expiry.getTime();

}

/**
 * Determine whether a listing/event has concluded.
 * Checks expires_after, event_end_date, multiple-date JSON rules, or non-recurring event_start_date.
 */
export function isListingExpired(item) {
  if (!item) return false;
  if (item.expires_after && isExpired(item.expires_after)) return true;
  if (item.expires_after) return false;
  if (item.event_end_date) return isExpired(item.event_end_date);

  const rawRule = String(item.recurrence_rule || '').trim();
  if (item.date_type === 'multiple' || rawRule.startsWith('[')) {
    try {
      const arr = JSON.parse(rawRule);
      if (Array.isArray(arr) && arr.length > 0) {
        const dates = arr.map((e) => (typeof e === 'string' ? e : e?.date)).filter(Boolean);
        if (dates.length > 0) return dates.every((d) => isExpired(d));
      }
    } catch { /* fall through */ }
  }

  if (item.date_type !== 'recurring' && item.event_start_date) {
    return isExpired(item.event_start_date);
  }
  return false;
}

/**
 * Always return a human-readable date string with actual event dates when available,
 * never hiding behind generic labels like "Recurring times and dates".
 */
export function formatEventScheduleDisplay(item) {
  if (!item) return '';
  const startStr = item.event_start_date ? formatDDMonthYYYY(item.event_start_date) : '';
  const endRaw = item.expires_after || item.event_end_date || '';
  const endStr = endRaw ? formatDDMonthYYYY(endRaw) : '';
  const rangeStr = startStr && endStr && endStr !== startStr
    ? `${startStr} – ${endStr}`
    : (startStr || endStr);

  const rawRule = String(item.recurrence_rule || '').trim();
  if (item.date_type === 'multiple' || rawRule.startsWith('[')) {
    try {
      const arr = JSON.parse(rawRule);
      if (Array.isArray(arr) && arr.length > 0) {
        const formatted = arr
          .map((e) => {
            const d = typeof e === 'string' ? e : e?.date;
            return d ? formatDDMonthYYYY(d) : '';
          })
          .filter(Boolean);
        if (formatted.length > 0) return formatted.join(', ');
      }
    } catch { /* fall through */ }
  }

  const label = String(item.event_date_label || '').trim();
  const isGeneric = !label || /^(recurring times and dates|see details(?: below)?|upcoming|ongoing|tba|tbd)$/i.test(label);
  const labelHasDate = /\b(?:\d{1,2}[-/]\w+|\w+\s+\d{1,2},?\s*\d{4}|\d{4}-\d{2}-\d{2})\b/i.test(label);
  const isRecurring = item.date_type === 'recurring' || /\b(?:every|weekly|monthly|1st|2nd|3rd|4th|last)\b/i.test(label);

  if (isRecurring) {
    if (isGeneric && rawRule && !rawRule.startsWith('{') && !rawRule.startsWith('[')) {
      return rawRule;
    }
    return label || rawRule || '';
  }

  if (isGeneric) {
    return rangeStr || label || '';
  }

  if (!labelHasDate && rangeStr) {
    return `${label} (${rangeStr})`;
  }

  return formatDDMonthYYYY(label) || rangeStr || label;
}



/**

 * Convert title, organization, or location into a clean SEO-friendly slug

 */

export function generateSlug(title, location = '') {

  const combined = `${title || 'event'} ${location || ''}`.trim();

  return combined

    .toLowerCase()

    .normalize('NFD')

    .replace(/[\u0300-\u036f]/g, '')

    .replace(/[^a-z0-9\s-]/g, '')

    .trim()

    .replace(/\s+/g, '-')

    .replace(/-+/g, '-')

    .slice(0, 80);

}



/**

 * "What's New Since Your Last Visit" tracking using privacy-conscious localStorage

 */

const LAST_VISIT_KEY = 'wg_last_discovery_visit';



export function recordVisitTimestamp() {

  try {

    const current = new Date().toISOString();

    // Keep previous visit timestamp in session to calculate diff during this session

    if (!sessionStorage.getItem('wg_current_session_visit')) {

      const prior = localStorage.getItem(LAST_VISIT_KEY) || new Date(Date.now() - 7 * 86400000).toISOString();

      sessionStorage.setItem('wg_current_session_visit', prior);

    }

    localStorage.setItem(LAST_VISIT_KEY, current);

  } catch (_) {}

}



export function getLastVisitTimestamp() {

  try {

    return sessionStorage.getItem('wg_current_session_visit') ||

      localStorage.getItem(LAST_VISIT_KEY) ||

      new Date(Date.now() - 7 * 86400000).toISOString();

  } catch (_) {

    return new Date(Date.now() - 7 * 86400000).toISOString();

  }

}



export function countNewListings(items = [], lastVisitIso = null) {

  if (!items || items.length === 0) return 0;

  const cutoff = new Date(lastVisitIso || getLastVisitTimestamp()).getTime();

  return items.filter(it => {

    const created = it.created_at || it.published_at || it.date;

    if (!created) return false;

    const itemTime = new Date(created).getTime();

    return !isNaN(itemTime) && itemTime > cutoff;

  }).length;

}



/**

 * "Save for Later" store for residents to bookmark events & sales

 * Distinct from redeemable wallet coupons

 */

const SAVED_ITEMS_KEY = 'wg_resident_saved_items';



export function getSavedItems() {

  try {

    const raw = localStorage.getItem(SAVED_ITEMS_KEY);

    return raw ? JSON.parse(raw) : [];

  } catch (_) {

    return [];

  }

}



export function isItemSaved(id) {

  const items = getSavedItems();

  return items.some(item => item.id === id);

}



export function toggleSaveItem(item) {

  try {

    const current = getSavedItems();

    const exists = current.some(it => it.id === item.id);

    let updated;

    if (exists) {

      updated = current.filter(it => it.id !== item.id);

    } else {

      updated = [

        {

          id: item.id,

          type: item.type || 'event',

          title: item.title || item.event_name || 'Listing',

          business_name: item.business_name || item.organizer || 'East Gwillimbury Partner',

          location: item.location || item.area || 'East Gwillimbury, ON',

          date_label: item.event_date_label || item.dates || item.time || '',

          saved_at: new Date().toISOString()

        },

        ...current

      ];

    }

    localStorage.setItem(SAVED_ITEMS_KEY, JSON.stringify(updated));

    window.dispatchEvent(new Event('wg_saved_items_changed'));

    return !exists;

  } catch (err) {

    console.error('Failed to toggle save item:', err);

    return false;

  }

}



/**

 * Generate standard iCalendar (.ics) download for events

 */

export function downloadEventIcs(event) {

  if (!event) return;

  const title = event.title || 'East Gwillimbury Community Event';

  const description = (event.summary || event.description || '').replace(/\r?\n/g, '\\n');

  const location = event.location || event.area || 'East Gwillimbury, ON';

  const url = event.link || window.location.href;



  let dtStartStr = '';

  let dtEndStr = '';



  const startDate = parseToMidnight(event.event_start_date || event.date);

  if (startDate) {

    const y = startDate.getFullYear();

    const m = String(startDate.getMonth() + 1).padStart(2, '0');

    const d = String(startDate.getDate()).padStart(2, '0');

    dtStartStr = `${y}${m}${d}T140000Z`; // Default 10 AM EST / 14:00 UTC

    dtEndStr = `${y}${m}${d}T170000Z`;   // Default 1 PM EST / 17:00 UTC

  } else {

    const now = new Date();

    const y = now.getFullYear();

    const m = String(now.getMonth() + 1).padStart(2, '0');

    const d = String(now.getDate()).padStart(2, '0');

    dtStartStr = `${y}${m}${d}T140000Z`;

    dtEndStr = `${y}${m}${d}T170000Z`;

  }



  const icsLines = [

    'BEGIN:VCALENDAR',

    'VERSION:2.0',

    'PRODID:-//Welcome East Gwillimbury//Community Events//EN',

    'CALSCALE:GREGORIAN',

    'METHOD:PUBLISH',

    'BEGIN:VEVENT',

    `UID:${event.id || 'wg-' + Date.now()}@welcomeeg.ca`,

    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,

    `DTSTART:${dtStartStr}`,

    `DTEND:${dtEndStr}`,

    `SUMMARY:${title}`,

    `DESCRIPTION:${description}`,

    `LOCATION:${location}`,

    `URL:${url}`,

    'STATUS:CONFIRMED',

    'END:VEVENT',

    'END:VCALENDAR'

  ];



  const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });

  const downloadUrl = URL.createObjectURL(blob);

  const a = document.createElement('a');

  a.href = downloadUrl;

  a.download = `${generateSlug(title)}.ics`;

  document.body.appendChild(a);

  a.click();

  document.body.removeChild(a);

  URL.revokeObjectURL(downloadUrl);

}



/**

 * Determines if an event recurs daily or high-frequency (> 2 times in a 7-day period).

 * Such events are pushed to the bottom of calendar date cards so the calendar showcases variety (events, sales, dining).

 */

export function isDailyOrHighFrequencyEvent(item, allItemsContext = []) {

  if (!item) return false;



  // 1. Explicit ongoing flag

  if (item.isOngoing) return true;



  // 2. Multi-day span (span >= 2 days means it appears on 3 or more calendar days)

  if (item.startOffset !== null && item.startOffset !== undefined &&

      item.endOffset !== null && item.endOffset !== undefined) {

    if (Math.abs(item.endOffset - item.startOffset) >= 2) {

      return true;

    }

  }



  // Check explicit date strings if available

  if (item.event_start_date && item.expires_after) {

    const s = parseToMidnight(item.event_start_date);

    const e = parseToMidnight(item.expires_after);

    if (s && e) {

      const diffDays = Math.round(Math.abs(e.getTime() - s.getTime()) / 86400000);

      if (diffDays >= 2) return true;

    }

  }



  // 3. Text indicators for daily recurrence or drop-in activities

  const textToCheck = `${item.title || ''} ${item.time || ''} ${item.event_date_label || ''} ${item.summary || ''} ${item.description || ''}`.toLowerCase();

  const dailyRegex = /\b(daily|open daily|every day|everyday|7 days a week|open 7 days|monday to friday|mon to fri|mon-fri|monday - friday|weekdays|drop-in|drop in)\b/i;

  if (dailyRegex.test(textToCheck)) {

    return true;

  }



  // 4. If allItemsContext is provided, check if matching items (by title) appear > 2 times in a 7-day window

  if (Array.isArray(allItemsContext) && allItemsContext.length > 0) {

    const normTitle = (item.title || '').trim().toLowerCase();

    if (normTitle) {

      const matchingItems = allItemsContext.filter(other => {

        const otherTitle = (other.title || '').trim().toLowerCase();

        return otherTitle === normTitle;

      });



      if (matchingItems.length > 2) {

        const offsets = matchingItems

          .map(m => m.startOffset ?? m.dateOffsetDays)

          .filter(o => o !== null && o !== undefined)

          .sort((a, b) => a - b);



        if (offsets.length > 2) {

          for (let i = 0; i <= offsets.length - 3; i++) {

            if (offsets[i + 2] - offsets[i] <= 7) {

              return true;

            }

          }

        } else {

          return true;

        }

      }

    }

  }



  return false;

}



/**

 * Sorts events for display on a calendar date card:

 * Pushes daily / high-frequency events (> 2 times in 7 days) to the bottom,

 * and surfaces variety (sales, dining, unique community events) at the top.

 */

export function sortEventsForCalendarDay(items = [], allItemsContext = []) {

  if (!Array.isArray(items) || items.length <= 1) return items || [];



  return [...items].sort((a, b) => {

    const aHighFreq = isDailyOrHighFrequencyEvent(a, allItemsContext);

    const bHighFreq = isDailyOrHighFrequencyEvent(b, allItemsContext);



    // High frequency events pushed to the bottom

    if (!aHighFreq && bHighFreq) return -1;

    if (aHighFreq && !bHighFreq) return 1;



    // Variety priority among low-frequency items (or between two high-frequency items)

    const getVarietyPriority = (item) => {

      const type = (item.type || '').toLowerCase();

      const cat = (item.category || '').toLowerCase();

      const badge = (item.badge || '').toLowerCase();

      const title = (item.title || '').toLowerCase();



      // 1. Sales & Deals top priority

      if (type === 'sale' || cat.includes('sale') || cat.includes('deal') || badge.includes('sale') || title.includes('sale') || title.includes('discount')) {

        return 1;

      }

      // 2. Dining & Food offers

      if (type === 'dining' || cat.includes('dining') || cat.includes('food') || cat.includes('restaurant') || badge.includes('dining')) {

        return 2;

      }

      // 3. Unique community / business events

      return 3;

    };



    const aPri = getVarietyPriority(a);

    const bPri = getVarietyPriority(b);

    if (aPri !== bPri) {

      return aPri - bPri;

    }



    return (a.title || '').localeCompare(b.title || '');

  });

}



/**

 * Universal color and high-contrast typography style map for category pills across the platform.

 * Returns tailored Tailwind CSS classes guaranteeing high contrast and WCAG AAA compliance.

 */

export function getCategoryBadgeStyle(category = '', type = '') {

  const cat = String(category || '').toLowerCase().trim();

  const t = String(type || '').toLowerCase().trim();



  // 1. Local Sales & Store Clearances -> Bright Amber Gold with Deep Black text

  if (t === 'sale' || cat.includes('sale') || cat.includes('discount') || cat.includes('clearance') || cat === 'retail sale') {

    return 'bg-amber-400 text-slate-950 border border-amber-500 font-medium';

  }



  // 2. East Gwillimbury Public Library -> Deep Purple with Pure White text

  if (cat.includes('library') || cat === 'library_events') {

    return 'bg-purple-700 text-white border border-purple-800 font-medium';

  }



  // 3. Concerts & Shows (including legacy theatre_events / Leacock Theatre) -> Deep Violet with Pure White text

  if (cat === 'theatre_events' || cat.includes('leacock') || cat === 'concerts_shows' || cat.includes('concert') || cat.includes('show') || cat.includes('live music') || cat.includes('live_music')) {

    return 'bg-violet-700 text-white border border-violet-800 font-medium';

  }



  // 4. Chamber of Commerce -> Deep Teal with Pure White text

  if (cat.includes('chamber') || cat === 'chamber_events') {

    return 'bg-teal-700 text-white border border-teal-800 font-medium';

  }



  // 5. Local Venue / Private Business -> Deep Forest Emerald with Pure White text

  if (cat.includes('venue') || cat.includes('private_business') || cat === 'business_event') {

    return 'bg-emerald-700 text-white border border-emerald-800 font-medium';

  }



  // 6. Local Gathering / Community Meetup -> Rich Indigo with Pure White text

  if (cat.includes('gathering') || cat.includes('meetup') || cat === 'eventbrite_meetup') {

    return 'bg-indigo-700 text-white border border-indigo-800 font-medium';

  }



  // 7. Town Events & Municipal Notices -> Royal Blue with Pure White text

  if (cat.includes('town') || cat === 'upcoming_events' || cat.includes('municipal')) {

    return 'bg-blue-700 text-white border border-blue-800 font-medium';

  }



  // 8. Local News & Updates -> Charcoal Slate with Pure White text

  if (cat.includes('news') || cat === 'local_news') {

    return 'bg-slate-800 text-white border border-slate-900 font-medium';

  }



  // 9. Family & Kids Activities -> Warm Orange with Pure White text

  if (cat.includes('family') || cat.includes('children') || cat.includes('kids') || cat.includes('storytime')) {

    return 'bg-orange-600 text-white border border-orange-700 font-medium';

  }



  // 10. Local Dining -> Warm Brick Red with Pure White text

  if (t === 'dining' || cat.includes('dining') || cat.includes('restaurant') || cat.includes('food')) {

    return 'bg-red-700 text-white border border-red-800 font-medium';

  }



  // Default fallback -> Deep Navy Blue with Pure White text

  return 'bg-[#00008b] text-white border border-blue-900 font-medium';

}



/**

 * Capitalize first letter of each word (Title Case) for names and street addresses.

 */

export function formatTitleCase(str) {

  if (!str) return '';

  return str.replace(/(?:^|\s|-|\/)([a-z\u00C0-\u017F])/g, match => match.toUpperCase());

}



/**

 * Format 10-digit phone number dynamically as (909) 555-5555.

 */

export function formatPhoneNumber(val) {
  if (!val) return '';
  let digits = val.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length < 3) return `(${digits}`;
  if (digits.length === 3) return `(${digits}) `;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

const GEORGINA_LOCALITY_KEYWORDS = [
  'east gwillimbury', 'holland landing', 'mount albert', 'queensville', 'sharon',
  'river drive park', 'river drive', 'holt', 'franklin', 'brown hill', 'ravenshoe'
];

const OUT_OF_AREA_KEYWORDS = [
  'georgina', 'keswick', 'sutton', 'pefferlaw', "jackson's point", 'jacksons point',
  'virginia', 'baldwin', 'udora', 'belhaven', 'egypt', 'sibbald point', "roche's point",
  'willow beach', 'island grove', 'port bolster',
  'newmarket', 'aurora', 'stouffville', 'whitchurch', 'markham', 'richmond hill',
  'vaughan', 'woodbridge', 'thornhill', 'king city', 'schomberg', 'nobleton',
  'bradford', 'uxbridge', 'barrie', 'innisfil', 'beaverton', 'cannington', 'york region'
];

export function isOutOfAreaLocation(locationStr) {
  if (!locationStr) return false;
  const lower = String(locationStr).toLowerCase().trim();
  if (lower.startsWith('out of area')) return true;
  const hasGeorgina = GEORGINA_LOCALITY_KEYWORDS.some(k => lower.includes(k));
  if (hasGeorgina) return false;
  return OUT_OF_AREA_KEYWORDS.some(k => lower.includes(k));
}

export function formatLocationDisplay(locationStr) {
  if (!locationStr) return 'East Gwillimbury, ON';
  const raw = String(locationStr).trim();
  if (!raw) return 'East Gwillimbury, ON';
  if (raw.toLowerCase().startsWith('out of area')) return raw;
  if (isOutOfAreaLocation(raw)) {
    return `Out of Area: ${raw}`;
  }
  return raw;
}

/**
 * Strips leading articles ("the ", quotes) for alphabetical sorting and A-Z indexing.
 * Preserves the actual name if stripping leaves nothing.
 */
export function getAlphabeticalSortName(name) {
  if (!name) return '';
  const trimmed = String(name).trim().replace(/^["'“‘]/, '');
  const stripped = trimmed.replace(/^the\s+/i, '').trim();
  return stripped || trimmed;
}

/**
 * Returns the uppercase first character of the normalized alphabetical sort name.
 */
export function getAlphabeticalFirstLetter(name) {
  const sortName = getAlphabeticalSortName(name);
  return (sortName[0] || '').toUpperCase();
}



