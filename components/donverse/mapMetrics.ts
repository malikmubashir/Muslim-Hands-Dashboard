import { DonverseData } from './types';
import { sliceCube } from '../../services/cube';

export type Granularity = 'dept' | 'region' | 'postcode';
export type MetricKey = 'amount' | 'count' | 'avg' | 'donors' | 'active';

export const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'amount', label: 'Montant collecté' },
  { key: 'count', label: 'Nombre de dons' },
  { key: 'avg', label: 'Don moyen' },
  { key: 'donors', label: 'Donateurs' },
  { key: 'active', label: 'Donateurs actifs' },
];

// One consolidated record per area, keyed by dept code or region nom.
export interface AreaRow {
  key: string;        // dept code or region nom
  name: string;       // display name
  amount: number;     // tx montant
  count: number;      // tx nb dons
  avg: number;        // don moyen
  donors: number;     // donor count
  active: number;     // active donors
  ltv: number;
}

export const metricValue = (row: AreaRow | undefined, m: MetricKey): number => {
  if (!row) return 0;
  switch (m) {
    case 'amount': return row.amount;
    case 'count': return row.count;
    case 'avg': return row.avg;
    case 'donors': return row.donors;
    case 'active': return row.active;
  }
};

// Build a Map<areaKey, AreaRow> for the selected granularity.
// When `range` is provided AND the cube is present, the tx amount/count come
// from the date-filtered cube slice; donor counts always come from the full
// (un-filtered) donor snapshot. Without a range we use the legacy full-period
// tx aggregates (data.tx.*).
export function buildAreaIndex(
  data: DonverseData,
  gran: Granularity,
  range?: { start: string; end: string },
): Map<string, AreaRow> {
  const idx = new Map<string, AreaRow>();
  const ensure = (key: string, name: string): AreaRow => {
    let r = idx.get(key);
    if (!r) { r = { key, name, amount: 0, count: 0, avg: 0, donors: 0, active: 0, ltv: 0 }; idx.set(key, r); }
    return r;
  };

  const useCube = !!(range && data.cube && data.cube.length);
  const slice = useCube ? sliceCube(data, range!) : null;

  if (gran === 'dept') {
    if (slice) {
      for (const t of slice.byDept) {
        const r = ensure(t.code, t.code);
        r.amount = t.value; r.count = t.count;
      }
    } else {
      for (const t of data.tx.byDept) {
        const r = ensure(t.code, t.code);
        r.amount = t.value; r.count = t.count;
      }
    }
    for (const dn of data.donors.byDept) {
      const r = ensure(dn.code, dn.code);
      r.donors = dn.count; r.active = dn.active; r.ltv = dn.ltv;
    }
  } else {
    if (slice) {
      for (const t of slice.byRegion) {
        const r = ensure(t.name, t.name);
        r.amount = t.value; r.count = t.count;
      }
    } else {
      for (const t of data.tx.byRegion) {
        const r = ensure(t.name, t.name);
        r.amount = t.value; r.count = t.count;
      }
    }
    for (const dn of data.donors.byRegion) {
      const r = ensure(dn.name, dn.name);
      r.donors = dn.count; r.active = dn.active; r.ltv = dn.ltv;
    }
  }
  for (const r of idx.values()) r.avg = r.count ? r.amount / r.count : 0;
  return idx;
}

// Quantile thresholds (5 buckets) over positive values only.
export function quantileBreaks(values: number[], buckets = 5): number[] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const breaks: number[] = [];
  for (let i = 1; i < buckets; i++) {
    const q = (i / buckets) * (sorted.length - 1);
    const lo = Math.floor(q), hi = Math.ceil(q);
    breaks.push(sorted[lo] + (sorted[hi] - sorted[lo]) * (q - lo));
  }
  return breaks;
}

// Light -> dark turquoise ramp (index 0 = lowest non-zero bucket).
export const GREEN_RAMP = ['#C8F1F8', '#9FE7F1', '#45C9DF', '#28B8D8', '#1C8099'];
export const NO_DATA = '#E5E7EB';

// Returns a fill color for a value given the quantile breaks.
export function colorFor(value: number, breaks: number[]): string {
  if (!value || value <= 0) return NO_DATA;
  let bucket = 0;
  while (bucket < breaks.length && value > breaks[bucket]) bucket++;
  return GREEN_RAMP[Math.min(bucket, GREEN_RAMP.length - 1)];
}

// DOM codes that have data but no metropolitan polygon.
export const DOM = [
  { code: '971', name: 'Guadeloupe' },
  { code: '972', name: 'Martinique' },
  { code: '973', name: 'Guyane' },
  { code: '974', name: 'La Réunion' },
  { code: '976', name: 'Mayotte' },
];
