import React from 'react';
import { CalendarRange } from 'lucide-react';
import { fmtDate } from './format';

export interface DateRange { start: string; end: string; }

interface DateRangeBarProps {
  /** Full available bounds from the cube, "YYYY-MM-DD". */
  dateMin: string;
  dateMax: string;
  range: DateRange;                       // current selection, "YYYY-MM-DD"
  onChange: (r: DateRange) => void;
}

// Add `days` to an ISO date "YYYY-MM-DD", clamped to bounds by the caller.
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
const maxISO = (a: string, b: string) => (a >= b ? a : b);
const minISO = (a: string, b: string) => (a <= b ? a : b);

/**
 * Compact global date-range toolbar with day-precision calendar pickers.
 * Two native <input type="date"> controls (Du / Au) bounded by dateMin/dateMax,
 * plus quick presets. Guards start <= end (clamps the other edge if violated).
 */
export const DateRangeBar: React.FC<DateRangeBarProps> = ({ dateMin, dateMax, range, onChange }) => {
  // Clamp a value into [dateMin, dateMax].
  const clamp = (v: string) => minISO(maxISO(v, dateMin), dateMax);

  const setStart = (raw: string) => {
    if (!raw) return;
    const start = clamp(raw);
    const end = start > range.end ? start : range.end; // keep start <= end
    onChange({ start, end });
  };
  const setEnd = (raw: string) => {
    if (!raw) return;
    const end = clamp(raw);
    const start = end < range.start ? end : range.start;
    onChange({ start, end });
  };

  // Presets, in day terms.
  const presetAll = { start: dateMin, end: dateMax };
  const preset2025 = { start: maxISO('2025-01-01', dateMin), end: minISO('2025-12-31', dateMax) };
  const preset3m = { start: maxISO(addDaysISO(dateMax, -90), dateMin), end: dateMax };

  const presetActive = (p: DateRange) => range.start === p.start && range.end === p.end;

  const presetBtn =
    'px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ';
  const presetOn = 'bg-emerald-600 text-white border-emerald-600';
  const presetOff = 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50';
  const inputCls =
    'text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="flex items-center gap-2 text-gray-700">
        <CalendarRange size={16} className="text-emerald-600" />
        <span className="text-sm font-semibold">Période</span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Du</label>
        <input
          type="date"
          value={range.start}
          min={dateMin}
          max={dateMax}
          onChange={(e) => setStart(e.target.value)}
          className={inputCls}
        />
        <label className="text-xs text-gray-500">Au</label>
        <input
          type="date"
          value={range.end}
          min={dateMin}
          max={dateMax}
          onChange={(e) => setEnd(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(presetAll)}
          className={presetBtn + (presetActive(presetAll) ? presetOn : presetOff)}
        >
          Toute la période
        </button>
        {preset2025.start <= preset2025.end && (
          <button
            type="button"
            onClick={() => onChange(preset2025)}
            className={presetBtn + (presetActive(preset2025) ? presetOn : presetOff)}
          >
            2025
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange(preset3m)}
          className={presetBtn + (presetActive(preset3m) ? presetOn : presetOff)}
        >
          3 derniers mois
        </button>
      </div>

      <div className="ml-auto text-xs text-gray-500">
        <span className="font-medium text-gray-700">{fmtDate(range.start)}</span>
        {' → '}
        <span className="font-medium text-gray-700">{fmtDate(range.end)}</span>
      </div>
    </div>
  );
};
