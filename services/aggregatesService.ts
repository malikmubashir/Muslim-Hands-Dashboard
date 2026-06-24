import { ChartData, DashboardStats, DateRange, DateBounds } from "../types";

// ---------------------------------------------------------------------------
// Types matching public/data/aggregates.json (produced by scripts/aggregate.mjs)
// ---------------------------------------------------------------------------

export interface AggregateBucket {
  month: string; // YYYY-MM
  name: string;
  value: number; // amount
  count: number;
}

export interface ThemeProjectBucket {
  month: string;
  theme: string;
  name: string; // project (Allocation Summary)
  value: number;
  count: number;
}

export interface AggregatesMeta {
  generatedAt: string;
  source: string;
  rowCount: number;
  skippedInvalidDate: number;
  grandTotalAmount: number;
  grandTotalCount: number;
  monthMin: string;
  monthMax: string;
}

export interface AggregatesFile {
  meta: AggregatesMeta;
  dims: {
    theme: AggregateBucket[];
    type: AggregateBucket[];
    project: AggregateBucket[];
    incomeType: AggregateBucket[];
    country: AggregateBucket[];
    region: AggregateBucket[];
  };
  themeProject: ThemeProjectBucket[];
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export async function loadAggregates(): Promise<AggregatesFile> {
  // Relative path; vite base is './' so this resolves under the app root and
  // works both in the browser (dev/preview) and packaged Electron.
  const res = await fetch('data/aggregates.json');
  if (!res.ok) {
    throw new Error(`Failed to load aggregates.json: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as AggregatesFile;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Slice 'YYYY-MM' from a 'YYYY-MM-DD' filter date. Empty values fall back to
// the open end so a missing bound never excludes data.
export function monthRange(
  filterDates: DateRange
): { startMonth: string; endMonth: string } {
  const startMonth = filterDates.start ? filterDates.start.slice(0, 7) : '0000-00';
  const endMonth = filterDates.end ? filterDates.end.slice(0, 7) : '9999-99';
  return { startMonth, endMonth };
}

function inRange(month: string, startMonth: string, endMonth: string): boolean {
  return month >= startMonth && month <= endMonth;
}

// Sum buckets in range by name -> ChartData[], sorted by value desc.
function aggregateDim(
  buckets: AggregateBucket[],
  startMonth: string,
  endMonth: string,
  nameFallback?: (name: string) => string
): ChartData[] {
  const acc = new Map<string, { value: number; count: number }>();
  for (const b of buckets) {
    if (!inRange(b.month, startMonth, endMonth)) continue;
    const name = nameFallback ? nameFallback(b.name) : b.name;
    let e = acc.get(name);
    if (!e) { e = { value: 0, count: 0 }; acc.set(name, e); }
    e.value += b.value;
    e.count += b.count;
  }
  return [...acc.entries()]
    .map(([name, e]) => ({ name, value: e.value, count: e.count }))
    .sort((a, b) => b.value - a.value);
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// Stats (mirrors services/dataService.ts calculateStats shape exactly)
// ---------------------------------------------------------------------------

export function statsFromAggregates(
  agg: AggregatesFile,
  range: { startMonth: string; endMonth: string }
): DashboardStats {
  const { startMonth, endMonth } = range;

  const byTheme = aggregateDim(agg.dims.theme, startMonth, endMonth);
  const byType = aggregateDim(agg.dims.type, startMonth, endMonth);
  const byProject = aggregateDim(agg.dims.project, startMonth, endMonth).slice(0, 10);
  const byIncomeType = aggregateDim(agg.dims.incomeType, startMonth, endMonth);
  const byCountry = aggregateDim(agg.dims.country, startMonth, endMonth).slice(0, 10);
  const byRegion = aggregateDim(agg.dims.region, startMonth, endMonth).slice(0, 10);

  // byDate: per-month totals across the theme dim (== grand totals per month).
  const monthAcc = new Map<string, { amount: number; count: number }>();
  for (const b of agg.dims.theme) {
    if (!inRange(b.month, startMonth, endMonth)) continue;
    let e = monthAcc.get(b.month);
    if (!e) { e = { amount: 0, count: 0 }; monthAcc.set(b.month, e); }
    e.amount += b.value;
    e.count += b.count;
  }
  const byDate = [...monthAcc.entries()]
    .map(([month, e]) => {
      const [y, m] = month.split('-');
      return {
        // First-of-month ISO so existing date-axis charts render identically.
        date: new Date(`${month}-01T00:00:00.000Z`).toISOString(),
        label: `${m}/${y}`,
        amount: round2(e.amount),
        count: e.count,
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Totals from byDate (consistent with month-granular filtering).
  const totalAmount = round2(byDate.reduce((a, b) => a + b.amount, 0));
  const totalDonations = byDate.reduce((a, b) => a + b.count, 0);
  const avgDonation = totalDonations > 0 ? totalAmount / totalDonations : 0;

  return {
    totalAmount,
    totalDonations,
    avgDonation,
    byTheme,
    byType,
    byProject,
    byIncomeType,
    byCountry,
    byRegion,
    byDate,
  };
}

// ---------------------------------------------------------------------------
// Deep dive (mirrors hooks/useDashboard deepDiveStats shape exactly)
// ---------------------------------------------------------------------------

export interface DeepDiveResult {
  bySubType: ChartData[];
  trendByMonth: { date: string; label: string; amount: number; count: number }[];
  totalDeepDiveAmount: number;
  totalDeepDiveCount: number;
}

export function deepDiveFromAggregates(
  agg: AggregatesFile,
  theme: string,
  range: { startMonth: string; endMonth: string }
): DeepDiveResult {
  const { startMonth, endMonth } = range;
  const rows = agg.themeProject.filter(
    (r) => r.theme === theme && inRange(r.month, startMonth, endMonth)
  );

  // bySubType: group by project name, sorted desc.
  const subAcc = new Map<string, { value: number; count: number }>();
  for (const r of rows) {
    let e = subAcc.get(r.name);
    if (!e) { e = { value: 0, count: 0 }; subAcc.set(r.name, e); }
    e.value += r.value;
    e.count += r.count;
  }
  const bySubType: ChartData[] = [...subAcc.entries()]
    .map(([name, e]) => ({ name, value: e.value, count: e.count }))
    .sort((a, b) => b.value - a.value);

  // trendByMonth: per-month totals, sorted asc (key 'YYYY-MM', label 'MM/YYYY').
  const monthAcc = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    let e = monthAcc.get(r.month);
    if (!e) { e = { amount: 0, count: 0 }; monthAcc.set(r.month, e); }
    e.amount += r.value;
    e.count += r.count;
  }
  const trendByMonth = [...monthAcc.entries()]
    .map(([month, e]) => {
      const [y, m] = month.split('-');
      return { date: month, label: `${m}/${y}`, amount: round2(e.amount), count: e.count };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalDeepDiveAmount = round2(rows.reduce((a, b) => a + b.value, 0));
  const totalDeepDiveCount = rows.reduce((a, b) => a + b.count, 0);

  return { bySubType, trendByMonth, totalDeepDiveAmount, totalDeepDiveCount };
}

// ---------------------------------------------------------------------------
// Bounds from meta
// ---------------------------------------------------------------------------

export function boundsFromMeta(meta: AggregatesMeta): DateBounds {
  const min = meta.monthMin ? `${meta.monthMin}-01` : '';
  let max = '';
  if (meta.monthMax) {
    const [y, m] = meta.monthMax.split('-').map(Number);
    // Last day of monthMax (day 0 of next month).
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    max = `${meta.monthMax}-${String(lastDay).padStart(2, '0')}`;
  }
  return { min, max };
}
