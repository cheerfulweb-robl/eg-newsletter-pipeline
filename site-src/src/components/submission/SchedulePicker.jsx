import React, { useState } from 'react';
import { Calendar, CalendarRange, CalendarDays, Repeat, AlertTriangle, HelpCircle, CheckCircle2 } from 'lucide-react';
import TimePicker from '../TimePicker';
import { WEEKDAY_OPTIONS, MONTHLY_ORDINAL_OPTIONS, rangeSpanDays } from './submissionLogic';

const LABEL = 'block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5';
const INPUT = 'w-full min-w-0 px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#00008b] text-left';
const SMALL_INPUT = 'w-full min-w-0 px-3 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#00008b] text-left';
const REQ = <span className="text-rose-500">*</span>;
const OPT = <span className="text-gray-400 font-normal normal-case tracking-normal">(Optional)</span>;

const PATTERNS = [
  {
    id: 'one_time',
    title: 'Single Day',
    hint: 'Happens once on 1 specific date (e.g., Saturday concert, one-day market)',
    Icon: Calendar
  },
  {
    id: 'date_range',
    title: 'Date Range',
    hint: 'Runs EVERY consecutive day without gaps (e.g., 3-day festival, week-long sale)',
    Icon: CalendarRange
  },
  {
    id: 'multiple',
    title: 'Multiple Dates',
    hint: 'Specific separate dates with gaps between them (e.g., Nov 19, Dec 17, Jan 21)',
    Icon: CalendarDays
  },
  {
    id: 'recurring',
    title: 'Recurring',
    hint: 'Repeats Weekly (every Tuesday) OR Monthly (e.g., 3rd Thursday of every month)',
    Icon: Repeat
  }
];

function liveCalendarPreview(s) {
  if (s.dateType === 'one_time') {
    return s.singleDate
      ? `Shows on the calendar ONLY on ${s.singleDate}.`
      : 'Pick a date to see how it will appear on the calendar.';
  }
  if (s.dateType === 'date_range') {
    const days = rangeSpanDays(s.rangeStartDate, s.rangeEndDate);
    if (!days) return 'Pick both a start and end date.';
    return `Shows on EVERY consecutive day from ${s.rangeStartDate} to ${s.rangeEndDate} (${days} ${days === 1 ? 'day' : 'days'} in a row).`;
  }
  if (s.dateType === 'multiple') {
    const filled = (s.multiDates || []).filter(d => d && d.date).map(d => d.date).sort();
    if (!filled.length) return 'Add each individual date — it will ONLY appear on those exact dates.';
    return `Shows ONLY on these ${filled.length} exact ${filled.length === 1 ? 'date' : 'dates'}: ${filled.join(', ')} (not on the days in between).`;
  }
  if (s.dateType === 'recurring') {
    if (s.recurringMode === 'monthly') {
      const wd = (WEEKDAY_OPTIONS.find(w => w.id === s.recurringMonthDay) || {}).full || s.recurringMonthDay;
      const tail = s.recurringEndDate ? ` until ${s.recurringEndDate}` : '';
      return `Shows ONLY on the ${s.recurringNth} ${wd} of every month${tail} — never on the days in between.`;
    }
    const picked = WEEKDAY_OPTIONS.filter(w => (s.recurringDays || []).includes(w.id)).map(w => w.full);
    if (!picked.length) return 'Select the day(s) of the week it repeats on.';
    const tail = s.recurringEndDate ? ` until ${s.recurringEndDate}` : '';
    return `Shows ONLY on every ${picked.join(', ')}${tail} — never on other days of the week.`;
  }
  return '';
}

/**
 * The one schedule picker used by the Event, Dining, Sale, and My Submissions Edit forms.
 * `value` is the schedule object from emptySchedule(); `onChange(next)` receives a new object.
 */
export default function SchedulePicker({ kind, value, onChange, idPrefix = 'sched' }) {
  const [showGuide, setShowGuide] = useState(false);
  const s = value;
  const set = (patch) => onChange({ ...s, ...patch });

  const updateRow = (idx, field, val) =>
    set({ multiDates: s.multiDates.map((row, i) => (i === idx ? { ...row, [field]: val } : row)) });
  const addRow = () => set({ multiDates: [...s.multiDates, { date: '', startTime: '', endTime: '', note: '' }] });
  const removeRow = (idx) => {
    if (s.multiDates.length <= 1) return;
    set({ multiDates: s.multiDates.filter((_, i) => i !== idx) });
  };
  const toggleDay = (id) =>
    set({ recurringDays: s.recurringDays.includes(id) ? s.recurringDays.filter(d => d !== id) : [...s.recurringDays, id] });

  const endDateRequired = kind === 'sale';
  const spanDays = s.dateType === 'date_range' ? rangeSpanDays(s.rangeStartDate, s.rangeEndDate) : 0;
  const longRangeWarning = s.dateType === 'date_range' && spanDays > (kind === 'event' ? 7 : 21);

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-gray-50 border border-gray-200 space-y-4 text-left min-w-0">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <span className="block text-xs font-black uppercase tracking-wider text-gray-900">
            Event Schedule Pattern {REQ}
          </span>
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#00008b] hover:underline cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{showGuide ? 'Hide date picker guide' : 'Not sure which option to pick?'}</span>
          </button>
        </div>

        <p className="text-xs text-gray-600 mb-3">
          Pick the pattern that matches the <strong>exact days</strong> people can attend — don&apos;t use Date Range for weekly or monthly events.
        </p>

        {showGuide && (
          <div className="mb-3 p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-slate-800 space-y-1.5 leading-relaxed">
            <p className="font-black text-[#00008b]">Quick Guide — Pick the right option:</p>
            <p><strong>• Once a month (e.g. 3rd Thursday of every month):</strong> Pick <strong>Recurring → Monthly</strong>.</p>
            <p><strong>• Same day(s) every week (e.g. Every Tuesday):</strong> Pick <strong>Recurring → Weekly</strong>.</p>
            <p><strong>• A few separate dates (e.g. Nov 19, Dec 17, Jan 21):</strong> Pick <strong>Multiple Dates</strong>.</p>
            <p><strong>• Every single consecutive day (e.g. Fri–Sun festival):</strong> Pick <strong>Date Range</strong>.</p>
            <p><strong>• Just one day:</strong> Pick <strong>Single Day</strong>.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Event schedule pattern">
          {PATTERNS.map(({ id, title, hint, Icon }) => {
            const active = s.dateType === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set({ dateType: id })}
                className={`min-w-0 p-3.5 rounded-xl border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                  active ? 'bg-[#00008b] border-[#00008b] text-white shadow-sm' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-amber-400' : 'text-blue-700'}`} />
                  <span className="text-xs font-black uppercase tracking-wider">{title}</span>
                </span>
                <span className="text-[11px] opacity-85 font-medium leading-snug">{hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {s.dateType === 'one_time' && (
        <div className="pt-3 border-t border-gray-200/80 space-y-4">
          <div>
            <label htmlFor={`${idPrefix}-single-date`} className={LABEL}>Date {REQ}</label>
            <input id={`${idPrefix}-single-date`} type="date" required value={s.singleDate} onChange={(e) => set({ singleDate: e.target.value })} className={INPUT} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TimePicker id={`${idPrefix}-single-start`} label="Start Time" value={s.singleStartTime} onChange={(v) => set({ singleStartTime: v })} />
            <TimePicker id={`${idPrefix}-single-end`} label="End Time (Optional)" value={s.singleEndTime} onChange={(v) => set({ singleEndTime: v })} />
          </div>
        </div>
      )}

      {s.dateType === 'date_range' && (
        <div className="pt-3 border-t border-gray-200/80 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0">
              <label htmlFor={`${idPrefix}-range-start`} className={LABEL}>Start Date {REQ}</label>
              <input id={`${idPrefix}-range-start`} type="date" required value={s.rangeStartDate} onChange={(e) => set({ rangeStartDate: e.target.value })} className={INPUT} />
            </div>
            <div className="min-w-0">
              <label htmlFor={`${idPrefix}-range-end`} className={LABEL}>End Date {REQ}</label>
              <input id={`${idPrefix}-range-end`} type="date" required min={s.rangeStartDate || undefined} value={s.rangeEndDate} onChange={(e) => set({ rangeEndDate: e.target.value })} className={INPUT} />
            </div>
          </div>

          {longRangeWarning && (
            <div role="alert" className="p-3.5 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <strong>Are you sure this happens every single day for {spanDays} days straight?</strong>{' '}
                  <strong>Date Range</strong> puts your listing on <em>every single day</em> between {s.rangeStartDate} and {s.rangeEndDate}. If it only happens on specific days (for example, the <strong>3rd Thursday of every month</strong> or <strong>every Tuesday</strong>), switch to <strong>Recurring</strong> or <strong>Multiple Dates</strong> instead:
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-7">
                <button
                  type="button"
                  onClick={() => set({
                    dateType: 'recurring',
                    recurringMode: 'monthly',
                    recurringStartDate: s.rangeStartDate,
                    recurringEndDate: s.rangeEndDate,
                    recurringStartTime: s.rangeStartTime,
                    recurringEndTime: s.rangeEndTime
                  })}
                  className="px-3 py-1.5 rounded-lg bg-[#00008b] text-white text-xs font-bold hover:bg-blue-900 cursor-pointer"
                >
                  Switch to Recurring (Monthly / Weekly)
                </button>
                <button
                  type="button"
                  onClick={() => set({
                    dateType: 'multiple',
                    multiDates: [{ date: s.rangeStartDate || '', startTime: s.rangeStartTime || '', endTime: s.rangeEndTime || '', note: '' }]
                  })}
                  className="px-3 py-1.5 rounded-lg bg-white border border-amber-400 text-amber-950 text-xs font-bold hover:bg-amber-100 cursor-pointer"
                >
                  Switch to Multiple Specific Dates
                </button>
              </div>
            </div>
          )}

          <p className="text-[11px] text-gray-500">Daily hours (the same every day of the range):</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TimePicker id={`${idPrefix}-range-start-time`} label="Daily Start Time" value={s.rangeStartTime} onChange={(v) => set({ rangeStartTime: v })} />
            <TimePicker id={`${idPrefix}-range-end-time`} label="Daily End Time (Optional)" value={s.rangeEndTime} onChange={(v) => set({ rangeEndTime: v })} />
          </div>
        </div>
      )}

      {s.dateType === 'multiple' && (
        <div className="pt-3 border-t border-gray-200/80 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="block text-xs font-black uppercase tracking-wider text-gray-900">Dates &amp; Times {REQ}</span>
              <p className="text-[11px] text-gray-500 mt-0.5">Add each specific date — your listing only appears on the exact dates listed below.</p>
            </div>
            <span className="text-xs font-bold text-[#00008b] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
              {s.multiDates.length} {s.multiDates.length === 1 ? 'Date' : 'Dates'}
            </span>
          </div>

          <div className="space-y-3">
            {s.multiDates.map((row, idx) => (
              <div key={idx} className="p-3 sm:p-4 rounded-xl bg-white border border-gray-200 space-y-3 text-left min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-[#00008b] bg-blue-50 px-2.5 py-0.5 rounded-md">Date {idx + 1}</span>
                  {s.multiDates.length > 1 && (
                    <button type="button" onClick={() => removeRow(idx)} className="text-xs font-bold text-rose-600 hover:text-rose-800 cursor-pointer">
                      Remove
                    </button>
                  )}
                </div>
                <div className="min-w-0">
                  <label htmlFor={`${idPrefix}-multi-date-${idx}`} className="block text-[11px] font-bold text-gray-700 mb-1">Date {REQ}</label>
                  <input id={`${idPrefix}-multi-date-${idx}`} type="date" required value={row.date} onChange={(e) => updateRow(idx, 'date', e.target.value)} className={SMALL_INPUT} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TimePicker id={`${idPrefix}-multi-start-${idx}`} label="Start Time" value={row.startTime} onChange={(v) => updateRow(idx, 'startTime', v)} />
                  <TimePicker id={`${idPrefix}-multi-end-${idx}`} label="End Time (Optional)" value={row.endTime} onChange={(v) => updateRow(idx, 'endTime', v)} />
                </div>
                <div className="min-w-0">
                  <label htmlFor={`${idPrefix}-multi-note-${idx}`} className="block text-[11px] font-bold text-gray-700 mb-1">Note for this date (Optional)</label>
                  <input id={`${idPrefix}-multi-note-${idx}`} type="text" value={row.note || ''} onChange={(e) => updateRow(idx, 'note', e.target.value)} placeholder="e.g. Kids session" className={SMALL_INPUT} />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-blue-300 hover:border-[#00008b] bg-blue-50/40 hover:bg-blue-50 text-[#00008b] text-xs font-bold transition-all cursor-pointer"
          >
            + Add Another Date
          </button>
        </div>
      )}

      {s.dateType === 'recurring' && (
        <div className="pt-3 border-t border-gray-200/80 space-y-4">
          {/* Weekly vs Monthly frequency switcher */}
          <div>
            <span className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-2">How Often Does It Repeat? {REQ}</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set({ recurringMode: 'weekly' })}
                className={`p-2.5 rounded-xl border text-xs font-black cursor-pointer transition-all ${
                  (s.recurringMode || 'weekly') === 'weekly'
                    ? 'bg-[#00008b] text-white border-[#00008b]'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
              >
                Weekly (e.g. Every Tuesday)
              </button>
              <button
                type="button"
                onClick={() => set({ recurringMode: 'monthly' })}
                className={`p-2.5 rounded-xl border text-xs font-black cursor-pointer transition-all ${
                  s.recurringMode === 'monthly'
                    ? 'bg-[#00008b] text-white border-[#00008b]'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
              >
                Monthly (e.g. 3rd Thursday)
              </button>
            </div>
          </div>

          {s.recurringMode === 'monthly' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="min-w-0">
                <label htmlFor={`${idPrefix}-rec-nth`} className={LABEL}>Which Week of the Month? {REQ}</label>
                <select
                  id={`${idPrefix}-rec-nth`}
                  value={s.recurringNth || '1st'}
                  onChange={(e) => set({ recurringNth: e.target.value })}
                  className={INPUT}
                >
                  {MONTHLY_ORDINAL_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label} week of every month</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor={`${idPrefix}-rec-month-day`} className={LABEL}>Day of the Week {REQ}</label>
                <select
                  id={`${idPrefix}-rec-month-day`}
                  value={s.recurringMonthDay || 'Thu'}
                  onChange={(e) => set({ recurringMonthDay: e.target.value })}
                  className={INPUT}
                >
                  {WEEKDAY_OPTIONS.map(w => <option key={w.id} value={w.id}>{w.full}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <span className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-2">Day(s) of the Week {REQ}</span>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map(w => {
                  const active = (s.recurringDays || []).includes(w.id);
                  return (
                    <button
                      key={w.id}
                      type="button"
                      aria-pressed={active}
                      aria-label={w.full}
                      onClick={() => toggleDay(w.id)}
                      className={`w-12 h-10 rounded-xl text-xs font-black uppercase transition-all cursor-pointer ${
                        active ? 'bg-[#00008b] text-white shadow-sm' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TimePicker id={`${idPrefix}-rec-start`} label="Start Time" value={s.recurringStartTime} onChange={(v) => set({ recurringStartTime: v })} />
            <TimePicker id={`${idPrefix}-rec-end`} label="End Time (Optional)" value={s.recurringEndTime} onChange={(v) => set({ recurringEndTime: v })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0">
              <label htmlFor={`${idPrefix}-rec-start-date`} className={LABEL}>Starts On {OPT}</label>
              <input
                id={`${idPrefix}-rec-start-date`}
                type="date"
                value={s.recurringStartDate || ''}
                onChange={(e) => set({ recurringStartDate: e.target.value })}
                className={INPUT}
              />
              <p className="text-[11px] text-gray-500 mt-1">Leave blank to start today.</p>
            </div>
            <div className="min-w-0">
              <label htmlFor={`${idPrefix}-rec-end-date`} className={LABEL}>
                End Date {endDateRequired ? REQ : OPT}
              </label>
              <input
                id={`${idPrefix}-rec-end-date`}
                type="date"
                required={endDateRequired}
                value={s.recurringEndDate || ''}
                onChange={(e) => set({ recurringEndDate: e.target.value })}
                className={INPUT}
              />
              {!endDateRequired && (
                <p className="text-[11px] text-gray-500 mt-1">Leave blank if it continues with no end date.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Calendar Preview Strip */}
      <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-start gap-2 text-xs text-emerald-950">
        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
        <div>
          <strong>Calendar preview:</strong> {liveCalendarPreview(s)}
        </div>
      </div>
    </div>
  );
}
