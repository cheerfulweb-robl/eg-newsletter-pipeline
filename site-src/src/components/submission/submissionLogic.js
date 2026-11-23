// Shared rules for the public Event, Dining and Sale submission forms.
// Pure functions only (no React, no network) so they can be unit tested.
import { formatDDMonthYYYY } from '../../services/discoveryService';
import { phoneProblem } from '../../utils/phone';
import { normalizeLink } from '../../utils/links';
import { GEORGINA_COMMUNITIES as TOWNS, OUT_OF_AREA, SERVICE_OPTIONS, normalizeAddress } from '../../utils/communities';
import { SALE_CATEGORIES } from '../../utils/saleCategories';

export const COMMUNITY_OPTIONS = [...TOWNS, 'All East Gwillimbury', OUT_OF_AREA];

// Dining service options, exactly as stored in vendor_events.service_options.
export const DINING_SERVICE_OPTIONS = SERVICE_OPTIONS; // ['Eat In', 'Take Out', 'Delivery']

export { SALE_CATEGORIES };

export const EVENT_CATEGORIES = [
  { value: 'community_events', label: 'Community Gathering & Social' },
  { value: 'concerts_shows', label: 'Concerts & Shows' },
  { value: 'workshops', label: 'Workshops, Fitness & Educational Classes' },
  { value: 'markets', label: 'Markets, Craft Fairs & Pop-ups' },
  { value: 'sports', label: 'Sports, Outdoors & Recreation' },
  { value: 'fundraisers', label: 'Charity, Non-Profit & Fundraisers' },
  { value: 'family', label: 'Kids & Family Friendly' },
  { value: 'arts', label: 'Arts, Visual Media & Culture' },
  { value: 'business_event', label: 'Local Business Event & Networking' },
  { value: 'news', label: '📰 Local News, Press Release & Media Story (shown in the Newsroom, not the calendar)' }
];

export const WEEKDAY_OPTIONS = [
  { id: 'Mon', label: 'Mon', full: 'Monday' },
  { id: 'Tue', label: 'Tue', full: 'Tuesday' },
  { id: 'Wed', label: 'Wed', full: 'Wednesday' },
  { id: 'Thu', label: 'Thu', full: 'Thursday' },
  { id: 'Fri', label: 'Fri', full: 'Friday' },
  { id: 'Sat', label: 'Sat', full: 'Saturday' },
  { id: 'Sun', label: 'Sun', full: 'Sunday' }
];

export const FALLBACK_LINKS = {
  event: 'https://welcomeeg.ca/events',
  dining: 'https://welcomeeg.ca/dining',
  sale: 'https://welcomeeg.ca/sales'
};

export const DEFAULT_DATE_TYPE = {
  event: 'one_time',
  dining: 'date_range',
  sale: 'date_range'
};

// Titles never carry bracket tags such as "[Sale]" or "[Eat In, Take Out]".
export function cleanTitle(title) {
  return String(title || '').replace(/^(\s*\[[^\]]*\]\s*)+/, '').trim();
}

export const MONTHLY_ORDINAL_OPTIONS = [
  { id: '1st', label: '1st' },
  { id: '2nd', label: '2nd' },
  { id: '3rd', label: '3rd' },
  { id: '4th', label: '4th' },
  { id: 'Last', label: 'Last' }
];

export function emptySchedule(kind) {
  return {
    dateType: DEFAULT_DATE_TYPE[kind] || 'one_time',
    singleDate: '',
    singleStartTime: '',
    singleEndTime: '',
    rangeStartDate: '',
    rangeEndDate: '',
    rangeStartTime: '',
    rangeEndTime: '',
    multiDates: [{ date: '', startTime: '', endTime: '', note: '' }],
    recurringMode: 'weekly', // 'weekly' | 'monthly'
    recurringDays: [],
    recurringNth: '1st',
    recurringMonthDay: 'Thu',
    recurringStartDate: '',
    recurringStartTime: '',
    recurringEndTime: '',
    recurringEndDate: ''
  };
}

/** Number of inclusive calendar days between rangeStartDate and rangeEndDate (0 if incomplete). */
export function rangeSpanDays(startIso, endIso) {
  if (!startIso || !endIso || endIso < startIso) return 0;
  const a = new Date(`${startIso}T12:00:00Z`).getTime();
  const b = new Date(`${endIso}T12:00:00Z`).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/** Reconstruct SchedulePicker state from an existing vendor_events row (for Edit modals). */
export function scheduleFromRow(row, kind = 'event') {
  const base = emptySchedule(kind);
  if (!row) return base;
  const start = String(row.event_start_date || '').slice(0, 10);
  const end = String(row.expires_after || '').slice(0, 10);
  const rule = String(row.recurrence_rule || '').trim();
  const label = String(row.event_date_label || '').trim();

  // Extract optional time pair from label ("... • 6:00 PM - 8:00 PM")
  let tStart = '';
  let tEnd = '';
  const tm = label.match(/•\s*(\d{1,2}:\d{2}\s*[AP]M)(?:\s*-\s*(\d{1,2}:\d{2}\s*[AP]M))?/i);
  if (tm) {
    tStart = tm[1].trim();
    tEnd = (tm[2] || '').trim();
  }

  // 1. Multiple dates JSON
  if (row.date_type === 'multiple' || rule.startsWith('[')) {
    try {
      const parsed = JSON.parse(rule);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return {
          ...base,
          dateType: 'multiple',
          multiDates: parsed.map(r => ({
            date: String(r.date || '').slice(0, 10),
            startTime: r.startTime || '',
            endTime: r.endTime || '',
            note: r.note || ''
          }))
        };
      }
    } catch (_) {}
    return { ...base, dateType: 'multiple', multiDates: [{ date: start, startTime: tStart, endTime: tEnd, note: '' }] };
  }

  // 2. Monthly nth-weekday pattern (e.g. "3rd Thursday of every month")
  const mMatch = (rule + ' ' + label).match(/\b(1st|2nd|3rd|4th|first|second|third|fourth|last)\s+(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+of\s+(?:every|each|the)\s+month/i);
  if (mMatch) {
    const ordMap = { '1st': '1st', first: '1st', '2nd': '2nd', second: '2nd', '3rd': '3rd', third: '3rd', '4th': '4th', fourth: '4th', last: 'Last' };
    const wdId = mMatch[2].slice(0, 1).toUpperCase() + mMatch[2].slice(1, 3).toLowerCase();
    return {
      ...base,
      dateType: 'recurring',
      recurringMode: 'monthly',
      recurringNth: ordMap[mMatch[1].toLowerCase()] || '1st',
      recurringMonthDay: wdId,
      recurringStartDate: start,
      recurringEndDate: end,
      recurringStartTime: tStart,
      recurringEndTime: tEnd
    };
  }

  // 3. Weekly recurring
  if (row.date_type === 'recurring') {
    const matchedDays = WEEKDAY_OPTIONS
      .filter(w => new RegExp(`\\b(${w.full}|${w.id})\\b`, 'i').test(rule || label))
      .map(w => w.id);
    return {
      ...base,
      dateType: 'recurring',
      recurringMode: 'weekly',
      recurringDays: matchedDays,
      recurringStartDate: start,
      recurringEndDate: end,
      recurringStartTime: tStart,
      recurringEndTime: tEnd
    };
  }

  // 4. Date range vs Single day
  if (row.date_type === 'date_range' || (start && end && end > start)) {
    return {
      ...base,
      dateType: 'date_range',
      rangeStartDate: start,
      rangeEndDate: end || start,
      rangeStartTime: tStart,
      rangeEndTime: tEnd
    };
  }

  return {
    ...base,
    dateType: 'one_time',
    singleDate: start,
    singleStartTime: tStart,
    singleEndTime: tEnd
  };
}

function timeText(start, end) {
  const s = String(start || '').trim();
  const e = String(end || '').trim();
  if (s && e) return `${s} - ${e}`;
  return s || e;
}

function withTime(label, start, end) {
  const t = timeText(start, end);
  return t ? `${label} • ${t}` : label;
}

/**
 * Turns the schedule picker state into the stored date columns.
 * Returns { error } or { dateType, startDate, expiresAfter, label, recurrenceRule }.
 * todayStr is YYYY-MM-DD (Toronto). event_start_date is always set on success.
 */
export function computeSchedule(kind, s, todayStr) {
  const dateType = s.dateType;

  if (dateType === 'one_time') {
    if (!s.singleDate) return { error: 'Please choose the date.' };
    return {
      dateType,
      startDate: s.singleDate,
      expiresAfter: s.singleDate,
      label: withTime(formatDDMonthYYYY(s.singleDate), s.singleStartTime, s.singleEndTime),
      recurrenceRule: null
    };
  }

  if (dateType === 'date_range') {
    if (!s.rangeStartDate || !s.rangeEndDate) return { error: 'Please choose both the start date and the end date.' };
    if (s.rangeEndDate < s.rangeStartDate) return { error: 'The end date must be on or after the start date.' };
    const base = s.rangeStartDate === s.rangeEndDate
      ? formatDDMonthYYYY(s.rangeStartDate)
      : `${formatDDMonthYYYY(s.rangeStartDate)} to ${formatDDMonthYYYY(s.rangeEndDate)}`;
    return {
      dateType,
      startDate: s.rangeStartDate,
      expiresAfter: s.rangeEndDate,
      label: withTime(base, s.rangeStartTime, s.rangeEndTime),
      recurrenceRule: null
    };
  }

  if (dateType === 'multiple') {
    const rows = (s.multiDates || [])
      .filter(d => d && d.date && String(d.date).trim())
      .map(d => ({
        date: d.date,
        startTime: d.startTime || '',
        endTime: d.endTime || '',
        ...(d.note && String(d.note).trim() ? { note: String(d.note).trim() } : {})
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length === 0) return { error: 'Please add at least one date.' };
    const first = rows[0].date;
    const last = rows[rows.length - 1].date;
    let label;
    if (rows.length === 1) {
      const d = rows[0];
      label = withTime(formatDDMonthYYYY(d.date), d.startTime, d.endTime) + (d.note ? ` (${d.note})` : '');
    } else {
      label = `Multiple Dates (${rows.length} Days): ${formatDDMonthYYYY(first)} to ${formatDDMonthYYYY(last)}`;
    }
    return { dateType, startDate: first, expiresAfter: last, label, recurrenceRule: JSON.stringify(rows) };
  }

  if (dateType === 'recurring') {
    const endDate = s.recurringEndDate || '';
    if (!endDate && kind === 'sale') return { error: 'Please choose the date this weekly sale ends.' };
    if (endDate && todayStr && endDate < todayStr) return { error: 'The end date cannot be in the past.' };
    const startBound = s.recurringStartDate || todayStr;

    if (s.recurringMode === 'monthly') {
      const nth = MONTHLY_ORDINAL_OPTIONS.find(o => o.id === s.recurringNth);
      const dayObj = WEEKDAY_OPTIONS.find(w => w.id === s.recurringMonthDay);
      if (!nth || !dayObj) return { error: 'Please choose which week of the month and day of the week.' };
      const rule = `${nth.id} ${dayObj.full} of every month`;
      const base = endDate
        ? `Every ${nth.id} ${dayObj.full} of the month until ${formatDDMonthYYYY(endDate)}`
        : `Every ${nth.id} ${dayObj.full} of the month`;
      return {
        dateType,
        startDate: startBound,
        expiresAfter: endDate || null,
        label: withTime(base, s.recurringStartTime, s.recurringEndTime),
        recurrenceRule: rule
      };
    }

    const days = WEEKDAY_OPTIONS.filter(w => (s.recurringDays || []).includes(w.id));
    if (days.length === 0) return { error: 'Please choose at least one day of the week.' };
    const daysText = days.map(w => w.full).join(', ');
    const base = endDate ? `Every ${daysText} until ${formatDDMonthYYYY(endDate)}` : `Every ${daysText}`;
    return {
      dateType,
      startDate: startBound,
      expiresAfter: endDate || null,
      label: withTime(base, s.recurringStartTime, s.recurringEndTime),
      recurrenceRule: daysText
    };
  }

  return { error: 'Please choose a schedule pattern.' };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Checks the form in on-screen order. Returns { message, field } for the first
 * problem, or null when everything is fine.
 */
export function validateFields(kind, f) {
  if (!cleanTitle(f.title)) return { field: 'title', message: 'Please enter a title.' };
  if (!String(f.businessName || '').trim()) return { field: 'businessName', message: 'Please enter the business, host or organization name.' };
  if (kind === 'event' && !f.eventCategory) return { field: 'category', message: 'Please choose a category.' };
  if (kind === 'sale' && !f.saleCategory) return { field: 'category', message: 'Please choose a category.' };
  if (kind === 'sale' && !String(f.priceText || '').trim()) return { field: 'priceText', message: 'Please enter the discount or deal.' };
  if (!String(f.location || '').trim()) return { field: 'location', message: 'Please enter the location or street address.' };
  if (!f.community) return { field: 'community', message: 'Please choose your community.' };
  if (normalizeLink(f.link) === null) return { field: 'link', message: 'Please check the website link, for example https://yourbusiness.ca' };
  if (!String(f.summary || '').trim()) return { field: 'summary', message: 'Please add a description.' };
  if (!String(f.firstName || '').trim() || !String(f.lastName || '').trim()) return { field: 'name', message: 'Please enter your first and last name.' };
  if (!EMAIL_RE.test(String(f.email || '').trim())) return { field: 'email', message: 'Please enter a valid email address.' };
  const phoneErr = phoneProblem(f.phone);
  if (phoneErr) return { field: 'phone', message: phoneErr };
  if (!f.agreeTerms || !f.agreePrivacy) return { field: 'agreements', message: 'Please confirm agreement to both the Privacy Policy and Terms of Service.' };
  return null;
}

/** Builds the vendor_events row. Assumes validateFields and computeSchedule passed. */
export function buildPayload({ kind, id, status, slug, fields: f, schedule }) {
  const community = (!f.community || f.community === 'All East Gwillimbury') ? 'East Gwillimbury' : f.community;
  const cleanLink = normalizeLink(f.link);
  const payload = {
    id,
    business_name: String(f.businessName).trim(),
    submitter_email: String(f.email).toLowerCase().trim(),
    contact_name: `${String(f.firstName).trim()} ${String(f.lastName).trim()}`,
    contact_phone: String(f.phone).trim(),
    date_type: schedule.dateType,
    recurrence_rule: schedule.recurrenceRule,
    title: cleanTitle(f.title),
    event_date_label: schedule.label,
    event_start_date: schedule.startDate,
    expires_after: schedule.expiresAfter,
    location: normalizeAddress(f.location, f.community),
    link: cleanLink || FALLBACK_LINKS[kind],
    summary: String(f.summary).trim(),
    category: kind === 'dining' ? 'dining' : kind === 'sale' ? 'special_sale' : f.eventCategory,
    community,
    slug,
    image_url: f.imageUrl ? `pending:${f.imageUrl}` : null,
    status
  };
  if (kind === 'dining') {
    payload.service_options = DINING_SERVICE_OPTIONS.filter(o => (f.serviceOptions || []).includes(o));
  }
  if (kind === 'sale') {
    payload.sale_category = f.saleCategory;
    payload.price_text = String(f.priceText).trim();
  }
  if (f.hamperContact) payload.hamper_contact = true;
  return payload;
}

/** Newsletter area: the stored community, with "East Gwillimbury" shown as "All East Gwillimbury". */
export function newsletterArea(storedCommunity) {
  return (!storedCommunity || storedCommunity === 'East Gwillimbury') ? 'All East Gwillimbury' : storedCommunity;
}

/** Formats parameters for the wg_check_listing_duplicate RPC check. */
export function buildDuplicateCheckParams(kind, fields, schedule) {
  return {
    p_title: cleanTitle(fields.title),
    p_start_date: schedule?.startDate || null,
    p_end_date: schedule?.expiresAfter || null,
    p_location: String(fields.location || '').trim(),
    p_community: (!fields.community || fields.community === 'All East Gwillimbury') ? 'East Gwillimbury' : fields.community,
    p_link: normalizeLink(fields.link) || null,
    p_email: String(fields.email || '').toLowerCase().trim(),
    p_kind: kind
  };
}

