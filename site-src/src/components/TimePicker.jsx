import React from 'react';

export default function TimePicker({ value, onChange, label, required = false, id = '' }) {
  // Parse hour, minute, period from e.g. "10:00 AM"
  const [hour, minute, period] = React.useMemo(() => {
    if (!value || typeof value !== 'string') return ['', '', 'AM'];
    const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (match) {
      return [match[1], match[2], (match[3] || 'AM').toUpperCase()];
    }
    return ['', '', 'AM'];
  }, [value]);

  const handleHourChange = (newHour) => {
    if (!newHour) {
      onChange('');
      return;
    }
    const m = minute || '00';
    const p = period || 'AM';
    onChange(`${newHour}:${m} ${p}`);
  };

  const handleMinuteChange = (newMin) => {
    const h = hour || '10';
    const p = period || 'AM';
    onChange(`${h}:${newMin} ${p}`);
  };

  const handlePeriodChange = (newPeriod) => {
    const h = hour || '10';
    const m = minute || '00';
    onChange(`${h}:${m} ${newPeriod}`);
  };

  return (
    <div className="space-y-1 text-left w-full">
      {label && (
        <label htmlFor={id ? `${id}-hour` : undefined} className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1 text-left">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <div className="flex items-center gap-1.5 text-left flex-wrap">
        <select
          id={id ? `${id}-hour` : undefined}
          value={hour}
          onChange={(e) => handleHourChange(e.target.value)}
          required={required}
          className="px-3 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#00008b] text-left"
        >
          <option value="">Hour</option>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <span className="text-gray-400 font-bold">:</span>

        <select
          id={id ? `${id}-minute` : undefined}
          value={minute}
          onChange={(e) => handleMinuteChange(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#00008b] text-left"
        >
          <option value="">Min</option>
          {['00', '15', '30', '45'].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          id={id ? `${id}-period` : undefined}
          value={period}
          onChange={(e) => handlePeriodChange(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#00008b] text-left"
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>

        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-[11px] font-bold text-gray-400 hover:text-rose-600 transition-colors ml-1"
            title="Clear time"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
