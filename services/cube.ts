// Cube client layer — slices the (month × theme) cube by date range (+ optional
// theme) and merges all per-cell breakdowns into chart-ready aggregates.
//
// Pure & typed: no React, no I/O. Consumed by the dashboard, the theme
// drill-down and the France map.
import type { DonverseData, CubeCell } from '../components/donverse/types';

export interface NamedRow { name: string; value: number; count: number; }
export interface PayRow { name: string; value: number; count: number; isPA: boolean; }
export interface DeptRow { code: string; value: number; count: number; }
export interface MonthRow { month: string; amount: number; count: number; }

export interface CubeSlice {
  total: number;
  count: number;
  avg: number;
  byTheme: NamedRow[];
  byStipulation: NamedRow[];
  byPayment: PayRow[];
  byDestination: NamedRow[];
  byCity: NamedRow[];
  byDept: DeptRow[];
  byRegion: NamedRow[];
  byMonth: MonthRow[];
  paShare: number;       // PA value / total (0..1)
  zakatShare: number;    // Zakat-stipulation value / total (0..1)
  topCity: NamedRow | null;
  topDestination: NamedRow | null;
  bestMonth: { month: string; amount: number } | null;
}

/** Months within [start,end] inclusive, preserving input order. */
export function monthsInRange(all: string[], start: string, end: string): string[] {
  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  return all.filter((m) => m >= lo && m <= hi);
}

// ---- merge helpers: sum tuples by key, return rows sorted by value desc ----
function mergeNamed(into: Map<string, NamedRow>, name: string, value: number, count: number) {
  const r = into.get(name);
  if (r) { r.value += value; r.count += count; }
  else into.set(name, { name, value, count });
}
function sortedNamed(m: Map<string, NamedRow>): NamedRow[] {
  return Array.from(m.values()).sort((a, b) => b.value - a.value);
}

/**
 * Slice the cube to cells with start<=m<=end (and t===theme when given) and
 * merge into chart-ready aggregates. byTheme is only meaningful when no theme
 * filter is applied (otherwise it has a single entry).
 */
export function sliceCube(
  data: DonverseData,
  range: { start: string; end: string },
  theme?: string,
): CubeSlice {
  const empty: CubeSlice = {
    total: 0, count: 0, avg: 0,
    byTheme: [], byStipulation: [], byPayment: [], byDestination: [],
    byCity: [], byDept: [], byRegion: [], byMonth: [],
    paShare: 0, zakatShare: 0, topCity: null, topDestination: null, bestMonth: null,
  };

  const cube = data.cube;
  if (!cube || cube.length === 0) return empty;

  const lo = range.start <= range.end ? range.start : range.end;
  const hi = range.start <= range.end ? range.end : range.start;

  const cells: CubeCell[] = cube.filter(
    (c) => c.m >= lo && c.m <= hi && (theme ? c.t === theme : true),
  );
  if (cells.length === 0) return empty;

  let total = 0;
  let count = 0;
  let paValue = 0;
  let zakatValue = 0;

  const themeMap = new Map<string, NamedRow>();
  const stipMap = new Map<string, NamedRow>();
  const payMap = new Map<string, PayRow>();
  const destMap = new Map<string, NamedRow>();
  const cityMap = new Map<string, NamedRow>();
  const deptMap = new Map<string, DeptRow>();
  const monthMap = new Map<string, MonthRow>();

  for (const c of cells) {
    total += c.v;
    count += c.c;

    mergeNamed(themeMap, c.t, c.v, c.c);

    const mm = monthMap.get(c.m);
    if (mm) { mm.amount += c.v; mm.count += c.c; }
    else monthMap.set(c.m, { month: c.m, amount: c.v, count: c.c });

    for (const [name, value, cnt] of c.stip) {
      mergeNamed(stipMap, name, value, cnt);
      if (name.toLowerCase().includes('zakat')) zakatValue += value;
    }
    for (const [name, value, cnt, isPA] of c.pay) {
      const r = payMap.get(name);
      if (r) { r.value += value; r.count += cnt; }
      else payMap.set(name, { name, value, count: cnt, isPA: isPA === 1 });
      if (isPA === 1) paValue += value;
    }
    for (const [name, value, cnt] of c.dest) mergeNamed(destMap, name, value, cnt);
    for (const [name, value, cnt] of c.city) mergeNamed(cityMap, name, value, cnt);
    for (const [code, value, cnt] of c.dept) {
      const r = deptMap.get(code);
      if (r) { r.value += value; r.count += cnt; }
      else deptMap.set(code, { code, value, count: cnt });
    }
  }

  // Roll departments up to régions via regionByDept.
  const regionByDept = data.regionByDept || {};
  const regionMap = new Map<string, NamedRow>();
  for (const d of deptMap.values()) {
    const region = regionByDept[d.code] || 'Autre / inconnu';
    mergeNamed(regionMap, region, d.value, d.count);
  }

  const byTheme = sortedNamed(themeMap);
  const byStipulation = sortedNamed(stipMap);
  const byDestination = sortedNamed(destMap);
  const byCity = sortedNamed(cityMap);
  const byRegion = sortedNamed(regionMap);
  const byPayment = Array.from(payMap.values()).sort((a, b) => b.value - a.value);
  const byDept = Array.from(deptMap.values()).sort((a, b) => b.value - a.value);
  const byMonth = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

  const bestMonth = byMonth.reduce<{ month: string; amount: number } | null>(
    (best, m) => (!best || m.amount > best.amount ? { month: m.month, amount: m.amount } : best),
    null,
  );

  return {
    total,
    count,
    avg: count ? total / count : 0,
    byTheme,
    byStipulation,
    byPayment,
    byDestination,
    byCity,
    byDept,
    byRegion,
    byMonth,
    paShare: total ? paValue / total : 0,
    zakatShare: total ? zakatValue / total : 0,
    topCity: byCity[0] || null,
    topDestination: byDestination[0] || null,
    bestMonth,
  };
}
