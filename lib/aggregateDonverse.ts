// Shared DONVERSE aggregation logic — pure, I/O-free, usable in Node AND browser.
//
// `aggregateDonverse(txRows, donorRows, opts)` takes plain row objects (already
// parsed from the spreadsheets via SheetJS `sheet_to_json`) and returns a fully
// anonymized DonverseData aggregate (zero PII). It performs NO file I/O.
//
// The Node refresh script (scripts/aggregate-donverse.ts) and the browser both
// import this single module so the published JSON is identical regardless of
// where it is produced.

import type { DonverseData } from '../components/donverse/types';

export type { DonverseData } from '../components/donverse/types';

export interface AggregateOptions {
  /** Suppress postcodes whose donor/transaction count is below this threshold. Default 5. */
  suppressMinDonors?: number;
  /** Caller-supplied meta (filenames + timestamp). Defaults applied if omitted. */
  sources?: string[];
  generatedAt?: string;
}

/** Extra (non-published) reconciliation figures returned alongside the data. */
export interface AggregateExtras {
  /** Base amount for tx rows with no valid France dept. */
  nonFranceTotal: number;
  /** Sum of base amount over all rows with a valid FR postcode (pre-suppression). */
  validPostcodeTxValue: number;
  validPostcodeTxCount: number;
  /** Base amount excluded from the cube due to invalid/unparseable month. */
  cubeExcludedValue: number;
  cubeExcludedCount: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- Département -> Région (names match regions.geojson `nom` exactly) ----
const DEPT_TO_REGION: Record<string, string> = {};
const REGION_DEPTS: Record<string, string[]> = {
  'Auvergne-Rhône-Alpes': ['01','03','07','15','26','38','42','43','63','69','73','74'],
  'Bourgogne-Franche-Comté': ['21','25','39','58','70','71','89','90'],
  'Bretagne': ['22','29','35','56'],
  'Centre-Val de Loire': ['18','28','36','37','41','45'],
  'Corse': ['2A','2B'],
  'Grand Est': ['08','10','51','52','54','55','57','67','68','88'],
  'Hauts-de-France': ['02','59','60','62','80'],
  'Île-de-France': ['75','77','78','91','92','93','94','95'],
  'Normandie': ['14','27','50','61','76'],
  'Nouvelle-Aquitaine': ['16','17','19','23','24','33','40','47','64','79','86','87'],
  'Occitanie': ['09','11','12','30','31','32','34','46','48','65','66','81','82'],
  'Pays de la Loire': ['44','49','53','72','85'],
  "Provence-Alpes-Côte d'Azur": ['04','05','06','13','83','84'],
  // DOM (not present in metropolitan regions.geojson; kept for data completeness)
  'Guadeloupe': ['971'],
  'Martinique': ['972'],
  'Guyane': ['973'],
  'La Réunion': ['974'],
  'Mayotte': ['976'],
};
for (const [region, depts] of Object.entries(REGION_DEPTS)) {
  for (const d of depts) DEPT_TO_REGION[d] = region;
}
const VALID_DEPTS = new Set(Object.keys(DEPT_TO_REGION));

// ---- Normalization helpers ----
const THEME_MAP: Record<string, string> = { 'Fonds general': 'Fonds général', 'Environement': 'Environnement' };
const STIP_MAP: Record<string, string> = { 'Zakat El MAal': 'Zakat El Maal' };

function normTheme(v: any): string {
  const t = (v == null ? '' : String(v)).trim();
  if (t === '') return 'Non spécifié';
  return THEME_MAP[t] || t;
}
function normStip(v: any): string {
  const t = (v == null ? '' : String(v)).trim();
  if (t === '') return 'Non spécifié';
  return STIP_MAP[t] || t;
}
function normPayment(v: any): string {
  const raw = (v == null ? '' : String(v));
  const t = raw.split(' - ')[0].trim();
  return t === '' ? 'Non spécifié' : t;
}
function normSimple(v: any): string {
  const t = (v == null ? '' : String(v)).trim();
  return t === '' ? 'Non spécifié' : t;
}
function normCity(v: any): string {
  const t = (v == null ? '' : String(v)).trim().toUpperCase();
  return t === '' ? 'NON SPÉCIFIÉ' : t;
}

// Department code from a postal code. Returns null if not a valid France dept.
function deptFromPostal(pc: any): string | null {
  const s = (pc == null ? '' : String(pc)).trim();
  if (s === '' || !/^[0-9]/.test(s)) return null;
  if (s.startsWith('97') || s.startsWith('98')) {
    const code = s.slice(0, 3);
    return VALID_DEPTS.has(code) ? code : null;
  }
  const first2 = s.slice(0, 2);
  if (first2 === '20') {
    const num5 = parseInt(s.slice(0, 5).replace(/\D/g, ''), 10);
    return (!isNaN(num5) && num5 < 20200) ? '2A' : '2B';
  }
  return VALID_DEPTS.has(first2) ? first2 : null;
}

// Normalize a "Postal Code" cell into a plausible 5-char French postcode.
// Returns null for blanks/invalid. Keeps metropolitan + DOM (97x/98x) codes.
function normPostcode(pc: any): string | null {
  if (pc == null) return null;
  let s = String(pc).trim();
  if (s === '') return null;
  // Strip any non-digit (handles "75001 Paris", floats like 75001.0, etc.)
  const digits = s.replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 5) return null;
  // Zero-pad 4-digit codes (e.g. Corsica/overseas leading-zero loss in Excel).
  const code = digits.length === 4 ? '0' + digits : digits.slice(0, 5);
  if (code.length !== 5) return null;
  // Must map to a recognised French department to be considered valid FR.
  if (deptFromPostal(code) == null) return null;
  return code;
}

function toMonth(d: any): string | null {
  if (d == null) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function yearOf(d: any): number | null {
  if (d == null) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.getUTCFullYear();
}
function num(v: any): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ---- Generic accumulators ----
interface Slice { value: number; count: number; isPA?: boolean; }
function addSlice(map: Map<string, Slice>, key: string, value: number, extra?: Partial<Slice>): Slice {
  let e = map.get(key);
  if (!e) { e = { value: 0, count: 0, ...(extra || {}) }; map.set(key, e); }
  e.value += value;
  e.count += 1;
  return e;
}
function sortDesc<T extends { value: number }>(arr: T[]): T[] { return arr.sort((a, b) => b.value - a.value); }

// ---- Donor segmentation helpers ----
function activityName(maxDate: any): string {
  const y = yearOf(maxDate);
  if (y == null) return 'Inconnu';
  if (y >= 2024) return 'Actif (2024+)';
  if (y >= 2021) return 'Inactif (2021-23)';
  return 'Oublié (<2021)';
}
function tierName(ltv: number): string {
  if (ltv >= 5000) return 'Major (≥5k)';
  if (ltv >= 1500) return 'Generous (1.5-5k)';
  if (ltv >= 500) return 'Engaged (500-1.5k)';
  return 'Kind (<500)';
}

const ACT_ORDER = ['Actif (2024+)', 'Inactif (2021-23)', 'Oublié (<2021)', 'Inconnu'];
const TIER_ORDER = ['Kind (<500)', 'Engaged (500-1.5k)', 'Generous (1.5-5k)', 'Major (≥5k)'];

/**
 * Pure aggregation: rows in -> DonverseData out. No file I/O.
 * Use `aggregateDonverseWithExtras` if you need reconciliation figures too.
 */
export function aggregateDonverse(
  txRows: any[],
  donorRows: any[],
  opts?: AggregateOptions,
): DonverseData {
  return aggregateDonverseWithExtras(txRows, donorRows, opts).data;
}

export function aggregateDonverseWithExtras(
  txRows: any[],
  donorRows: any[],
  opts?: AggregateOptions,
): { data: DonverseData; extras: AggregateExtras } {
  const suppressMinDonors = opts?.suppressMinDonors ?? 5;

  // ================= TRANSACTIONS =================
  const byDept = new Map<string, Slice>();
  const byRegion = new Map<string, Slice>();
  const byTheme = new Map<string, Slice>();
  const byStipulation = new Map<string, Slice>();
  const byPayment = new Map<string, Slice>();
  const byDestination = new Map<string, Slice>();
  const byMonth = new Map<string, { amount: number; count: number }>();
  const byCountry = new Map<string, Slice>();
  const byPostcodeTx = new Map<string, { value: number; count: number }>();

  // ---- Cube (month × theme) accumulators ----
  interface CubeAcc {
    v: number; c: number;
    stip: Map<string, Slice>;
    pay: Map<string, Slice>;   // Slice.isPA carried per family
    dest: Map<string, Slice>;
    city: Map<string, Slice>;
    dept: Map<string, Slice>;
  }
  const cubeMap = new Map<string, CubeAcc>(); // key = `${month}${theme}`
  const themeFullTotal = new Map<string, number>(); // theme -> full-period base total
  const monthSet = new Set<string>();
  let cubeExcludedValue = 0; // base amount on rows with invalid/unparseable month
  let cubeExcludedCount = 0;

  let txTotalBase = 0;
  let nonFranceTotal = 0;
  let validPostcodeTxValue = 0;
  let validPostcodeTxCount = 0;
  let monthMin: string | null = null;
  let monthMax: string | null = null;

  for (const r of txRows) {
    const amount = num(r['Donation Amount (Base)']);
    txTotalBase += amount;

    const theme = normTheme(r['Fund Dimension 2']);
    const stip = normStip(r['Fund Dimension 3']);
    const dest = normSimple(r['Fund Dimension 1']);
    const payment = normPayment(r['Payment Method']);
    const isPA = payment === 'Direct Debit';
    const country = normSimple(r['Address Country']);
    const dept = deptFromPostal(r['Postal Code']);
    const month = toMonth(r['Date']);
    const postcode = normPostcode(r['Postal Code']);
    const city = normCity(r['Locality']);

    addSlice(byTheme, theme, amount);
    addSlice(byStipulation, stip, amount);
    addSlice(byPayment, payment, amount, { isPA }).isPA = isPA;
    addSlice(byDestination, dest, amount);
    addSlice(byCountry, country, amount);

    if (dept && VALID_DEPTS.has(dept)) {
      addSlice(byDept, dept, amount);
      addSlice(byRegion, DEPT_TO_REGION[dept], amount);
    } else {
      nonFranceTotal += amount;
    }

    if (postcode) {
      let pe = byPostcodeTx.get(postcode);
      if (!pe) { pe = { value: 0, count: 0 }; byPostcodeTx.set(postcode, pe); }
      pe.value += amount; pe.count += 1;
      validPostcodeTxValue += amount; validPostcodeTxCount += 1;
    }

    if (month) {
      let m = byMonth.get(month);
      if (!m) { m = { amount: 0, count: 0 }; byMonth.set(month, m); }
      m.amount += amount; m.count += 1;
      if (monthMin === null || month < monthMin) monthMin = month;
      if (monthMax === null || month > monthMax) monthMax = month;
    }

    // ---- Cube (month × theme) ----
    // Rows with an invalid/unparseable month are excluded from the cube
    // (consistent with byMonth above), but counted in txTotalBase (which
    // sums every row). Track the excluded amount for transparent reconcile.
    themeFullTotal.set(theme, (themeFullTotal.get(theme) || 0) + amount);
    if (month) {
      monthSet.add(month);
      // month is always exactly 7 chars ("YYYY-MM"); split at fixed pos 7.
      const key = month + theme;
      let cell = cubeMap.get(key);
      if (!cell) {
        cell = {
          v: 0, c: 0,
          stip: new Map(), pay: new Map(), dest: new Map(),
          city: new Map(), dept: new Map(),
        };
        cubeMap.set(key, cell);
      }
      cell.v += amount; cell.c += 1;
      addSlice(cell.stip, stip, amount);
      addSlice(cell.pay, payment, amount, { isPA }).isPA = isPA;
      addSlice(cell.dest, dest, amount);
      addSlice(cell.city, city, amount);
      if (dept && VALID_DEPTS.has(dept)) addSlice(cell.dept, dept, amount);
    } else {
      cubeExcludedValue += amount;
      cubeExcludedCount += 1;
    }
  }

  // ================= DONORS =================
  const dByActivity = new Map<string, number>();
  const dByTier = new Map<string, number>();
  const dByType = new Map<string, number>();
  const dByConsent = new Map<string, number>();
  const dByDept = new Map<string, { count: number; active: number; ltv: number }>();
  const dByRegion = new Map<string, { count: number; active: number; ltv: number }>();
  const dByPostcode = new Map<string, { count: number; active: number; ltv: number }>();

  let donorTotal = 0;
  let donorLtv = 0;

  const inc = (map: Map<string, number>, key: string) => { map.set(key, (map.get(key) || 0) + 1); };

  for (const r of donorRows) {
    donorTotal += 1;
    const ltv = num(r['Total Donation Amount']);
    donorLtv += ltv;
    const maxDate = r['Maximum Donation Date'];
    const isActive = (yearOf(maxDate) || 0) >= 2024;

    inc(dByActivity, activityName(maxDate));
    inc(dByTier, tierName(ltv));
    inc(dByType, normSimple(r['Type']));
    const consentRaw = (r['RGPD POST IN'] == null ? '' : String(r['RGPD POST IN'])).trim();
    inc(dByConsent, consentRaw === '' ? 'Non renseigné' : consentRaw);

    const dept = deptFromPostal(r['Postal Code']);
    if (dept && VALID_DEPTS.has(dept)) {
      let e = dByDept.get(dept);
      if (!e) { e = { count: 0, active: 0, ltv: 0 }; dByDept.set(dept, e); }
      e.count += 1; if (isActive) e.active += 1; e.ltv += ltv;
      const region = DEPT_TO_REGION[dept];
      let re = dByRegion.get(region);
      if (!re) { re = { count: 0, active: 0, ltv: 0 }; dByRegion.set(region, re); }
      re.count += 1; if (isActive) re.active += 1; re.ltv += ltv;
    }

    const postcode = normPostcode(r['Postal Code']);
    if (postcode) {
      let pe = dByPostcode.get(postcode);
      if (!pe) { pe = { count: 0, active: 0, ltv: 0 }; dByPostcode.set(postcode, pe); }
      pe.count += 1; if (isActive) pe.active += 1; pe.ltv += ltv;
    }
  }

  // ================= ASSEMBLE OUTPUT =================
  const txByDept = [...byDept.entries()].map(([code, e]) => ({ code, value: round2(e.value), count: e.count }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const txByRegion = sortDesc([...byRegion.entries()].map(([name, e]) => ({ name, value: round2(e.value), count: e.count })));
  const txByTheme = sortDesc([...byTheme.entries()].map(([name, e]) => ({ name, value: round2(e.value), count: e.count })));
  const txByStip = sortDesc([...byStipulation.entries()].map(([name, e]) => ({ name, value: round2(e.value), count: e.count })));
  const txByPayment = sortDesc([...byPayment.entries()].map(([name, e]) => ({ name, value: round2(e.value), count: e.count, isPA: !!e.isPA })));
  const txByDest = sortDesc([...byDestination.entries()].map(([name, e]) => ({ name, value: round2(e.value), count: e.count })));
  const txByMonth = [...byMonth.entries()].map(([month, e]) => ({ month, amount: round2(e.amount), count: e.count }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const txByCountry = sortDesc([...byCountry.entries()].map(([name, e]) => ({ name, value: round2(e.value), count: e.count })));

  // ---- Postcode small-cell suppression (transactions) ----
  const txByPostcode: { postcode: string; value: number; count: number }[] = [];
  let txSuppCount = 0;
  let txSuppValue = 0;
  for (const [postcode, e] of byPostcodeTx.entries()) {
    if (e.count < suppressMinDonors) {
      txSuppCount += e.count;
      txSuppValue += e.value;
    } else {
      txByPostcode.push({ postcode, value: round2(e.value), count: e.count });
    }
  }
  txByPostcode.sort((a, b) => b.value - a.value);

  // ---- Postcode small-cell suppression (donors) ----
  const donorsByPostcode: { postcode: string; count: number; active: number; ltv: number }[] = [];
  let donorSuppCount = 0;
  let suppressedPostcodeSet = new Set<string>();
  for (const [postcode, e] of dByPostcode.entries()) {
    if (e.count < suppressMinDonors) {
      donorSuppCount += e.count;
      suppressedPostcodeSet.add(postcode);
    } else {
      donorsByPostcode.push({ postcode, count: e.count, active: e.active, ltv: round2(e.ltv) });
    }
  }
  donorsByPostcode.sort((a, b) => b.count - a.count);
  // Count distinct postcodes omitted from EITHER published array.
  for (const [postcode, e] of byPostcodeTx.entries()) {
    if (e.count < suppressMinDonors) suppressedPostcodeSet.add(postcode);
  }
  const postcodesSuppressed = suppressedPostcodeSet.size;

  // Donor ordered category lists (fixed display order)
  const dByActivityArr = ACT_ORDER.map(name => ({ name, count: dByActivity.get(name) || 0 }));
  const dByTierArr = TIER_ORDER.map(name => ({ name, count: dByTier.get(name) || 0 }));
  const dByTypeArr = [...dByType.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const dByConsentArr = [...dByConsent.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const dByDeptArr = [...dByDept.entries()].map(([code, e]) => ({ code, count: e.count, active: e.active, ltv: round2(e.ltv) }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const dByRegionArr = [...dByRegion.entries()].map(([name, e]) => ({ name, count: e.count, active: e.active, ltv: round2(e.ltv) }))
    .sort((a, b) => b.count - a.count);

  // ================= ASSEMBLE CUBE (month × theme) =================
  const months = [...monthSet].sort((a, b) => a.localeCompare(b));
  const themes = [...themeFullTotal.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  // Convert a Slice map to a sorted positional-tuple array (value desc).
  const stipArr = (m: Map<string, Slice>): [string, number, number][] =>
    [...m.entries()].map(([k, e]) => [k, round2(e.value), e.count] as [string, number, number])
      .sort((a, b) => b[1] - a[1]);
  const payArr = (m: Map<string, Slice>): [string, number, number, 0 | 1][] =>
    [...m.entries()].map(([k, e]) => [k, round2(e.value), e.count, (e.isPA ? 1 : 0) as 0 | 1] as [string, number, number, 0 | 1])
      .sort((a, b) => b[1] - a[1]);

  const cube = [...cubeMap.entries()].map(([key, cell]) => {
    const m = key.slice(0, 7);   // "YYYY-MM"
    const t = key.slice(7);      // theme
    return {
      m, t,
      v: round2(cell.v),
      c: cell.c,
      stip: stipArr(cell.stip),
      pay: payArr(cell.pay),
      dest: stipArr(cell.dest),
      // city is HIGH cardinality: store TOP 30 by value.
      city: stipArr(cell.city).slice(0, 30),
      dept: stipArr(cell.dept),
    };
  }).sort((a, b) => (a.m === b.m ? a.t.localeCompare(b.t) : a.m.localeCompare(b.m)));

  // regionByDept: only the dept codes that actually appear in tx data.
  const regionByDept: Record<string, string> = {};
  for (const code of byDept.keys()) regionByDept[code] = DEPT_TO_REGION[code];

  // postcodeGlobal: FULL period (not theme/date filtered), reuses the
  // already-computed suppressed tx postcode aggregation.
  const postcodeGlobal = {
    byPostcode: txByPostcode.map(p => ({ postcode: p.postcode, value: p.value, count: p.count })),
    suppressed: { count: txSuppCount, value: round2(txSuppValue) },
  };

  const data: DonverseData = {
    meta: {
      generatedAt: opts?.generatedAt ?? new Date().toISOString(),
      sources: opts?.sources ?? [],
      currency: 'EUR',
      txRows: txRows.length,
      txTotalBase: round2(txTotalBase),
      donorRows: donorRows.length,
      monthMin: monthMin as string,
      monthMax: monthMax as string,
      note: 'Region names match regions.geojson `nom` exactly (13 metropolitan regions). DOM departments (971-976) and their regions appear in the data slices for completeness but have NO polygon in the metropolitan france-geojson, so they will not render on the choropleth map.',
      suppressMinDonors,
      postcodesSuppressed,
      schema: 'cube-v2',
    },
    tx: {
      byDept: txByDept,
      byRegion: txByRegion,
      byTheme: txByTheme,
      byStipulation: txByStip,
      byPayment: txByPayment,
      byDestination: txByDest,
      byMonth: txByMonth,
      byCountry: txByCountry,
      byPostcode: txByPostcode,
      postcodeSuppressed: { count: txSuppCount, value: round2(txSuppValue) },
    },
    donors: {
      total: donorTotal,
      totalLtv: round2(donorLtv),
      byActivity: dByActivityArr,
      byTier: dByTierArr,
      byType: dByTypeArr,
      byConsent: dByConsentArr,
      byDept: dByDeptArr,
      byRegion: dByRegionArr,
      byPostcode: donorsByPostcode,
      postcodeSuppressed: { count: donorSuppCount },
    },
    months,
    themes,
    cube,
    regionByDept,
    postcodeGlobal,
  };

  return {
    data,
    extras: {
      nonFranceTotal: round2(nonFranceTotal),
      validPostcodeTxValue: round2(validPostcodeTxValue),
      validPostcodeTxCount,
      cubeExcludedValue: round2(cubeExcludedValue),
      cubeExcludedCount,
    },
  };
}
