import React, { useMemo } from 'react';
import { CalendarRange } from 'lucide-react';
import { fmtMonth } from './format';

export interface DateRange { start: string; end: string; }

interface DateRangeBarProps {
  months: string[];                 // ascending "YYYY-MM"
  range: DateRange;
  onChange: (r: DateRange) => void;
}

/**
 * Compact global date-range toolbar: Du / Au month selects + quick presets.
 * Guards start <= end. Month strings are ISO ("YYYY-MM"); labels are FR.
 */
export const DateRangeBar: React.FC<DateRangeBarProps> = ({ months, range, onChange }) => {
  const first = months[0];
  const last = months[months.length - 1];

  // 3 last months available in the dataset.
  const last3 = useMemo(() => months.slice(Math.max(0, months.length - 3)), [months]);
  // Months belonging to 2025.
  const months2025 = useMemo(() => months.filter((m) => m.startsWith('2025')), [months]);

  const setStart = (start: string) => {
    const end = start > range.end ? start : range.end; // keep start <= end
    onChange({ start, end });
  };
  const setEnd = (end: string) => {
    const start = end < range.start ? end : range.start;
    onChange({ start, end });
  };

  const presetActive = (s: string, e: string) => range.start === s && range.end === e;

  const presetBtn =
    'px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ';
  const presetOn = 'bg-emerald-600 text-white border-emerald-600';
  const presetOff = 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="flex items-center gap-2 text-gray-700">
        <CalendarRange size={16} className="text-emerald-600" />
        <span className="text-sm font-semibold">Période</span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Du</label>
        <select
          value={range.start}
          onChange={(e) => setStart(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {months.map((m) => (
            <option key={m} value={m}>{fmtMonth(m)}</option>
          ))}
        </select>
        <label className="text-xs text-gray-500">Au</label>
        <select
          value={range.end}
          onChange={(e) => setEnd(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {months.map((m) => (
            <option key={m} value={m}>{fmtMonth(m)}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange({ start: first, end: last })}
          className={presetBtn + (presetActive(first, last) ? presetOn : presetOff)}
        >
          Toute la période
        </button>
        {months2025.length > 0 && (
          <button
            type="button"
            onClick={() => onChange({ start: months2025[0], end: months2025[months2025.length - 1] })}
            className={presetBtn + (presetActive(months2025[0], months2025[months2025.length - 1]) ? presetOn : presetOff)}
          >
            2025
          </button>
        )}
        {last3.length > 0 && (
          <button
            type="button"
            onClick={() => onChange({ start: last3[0], end: last3[last3.length - 1] })}
            className={presetBtn + (presetActive(last3[0], last3[last3.length - 1]) ? presetOn : presetOff)}
          >
            3 derniers mois
          </button>
        )}
      </div>

      <div className="ml-auto text-xs text-gray-500">
        <span className="font-medium text-gray-700">{fmtMonth(range.start)}</span>
        {' → '}
        <span className="font-medium text-gray-700">{fmtMonth(range.end)}</span>
      </div>
    </div>
  );
};
