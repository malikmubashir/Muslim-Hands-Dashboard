// DONVERSE data shapes — mirrors public/data/donverse.json

export interface TxAmountRow { name: string; value: number; count: number; }
export interface TxDeptRow { code: string; value: number; count: number; }
export interface TxPaymentRow { name: string; value: number; count: number; isPA: boolean; }
export interface TxMonthRow { month: string; amount: number; count: number; }

export interface DonorNameRow { name: string; count: number; }
export interface DonorDeptRow { code: string; count: number; active: number; ltv: number; }
export interface DonorRegionRow { name: string; count: number; active: number; ltv: number; }

// Postcode-level aggregates (for heatmaps). Small-cell suppressed in the
// published output; residual rolled into the *PostcodeSuppressed buckets.
export interface TxPostcodeRow { postcode: string; value: number; count: number; }
export interface DonorPostcodeRow { postcode: string; count: number; active: number; ltv: number; }

// ---- Cube (DAY × theme) breakdowns (Phase 9a; day-granular schema "cube-v3-day") ----
// Per-cell breakdown tuples are stored as positional arrays to keep the JSON
// compact. stip/pay/dest/dept are LOW cardinality and stored in FULL (exact);
// city is HIGH cardinality and stored TOP 30 by value per cell.
export type CubeStip = [string, number, number];          // [name, value, count]
export type CubePay = [string, number, number, 0 | 1];    // [name, value, count, isPA]
export type CubeDest = [string, number, number];          // [destination, value, count]
export type CubeCity = [string, number, number];          // [city, value, count] (TOP 30)
export type CubeDept = [string, number, number];          // [deptCode, value, count]

export interface CubeCell {
  d: string;        // donation date "YYYY-MM-DD"
  t: string;        // theme
  v: number;        // amount (base) for this (month,theme)
  c: number;        // donation count
  stip: CubeStip[]; // ALL stipulations in this cell
  pay: CubePay[];   // ALL payment families in this cell
  dest: CubeDest[]; // ALL destinations in this cell
  city: CubeCity[]; // TOP 30 cities by value in this cell
  dept: CubeDept[]; // ALL valid FR dept codes present in this cell
}

export interface PostcodeGlobalRow { postcode: string; value: number; count: number; }
export interface PostcodeGlobal {
  byPostcode: PostcodeGlobalRow[];
  suppressed: { count: number; value: number };
}

export interface DonverseData {
  meta: {
    generatedAt: string;
    sources: string[];
    currency: string;
    txRows: number;
    txTotalBase: number;
    donorRows: number;
    monthMin: string;
    monthMax: string;
    dateMin?: string;  // earliest donation date "YYYY-MM-DD" present in the cube
    dateMax?: string;  // latest donation date "YYYY-MM-DD" present in the cube
    note?: string;
    // Postcode small-cell suppression (Phase 7a).
    suppressMinDonors?: number;
    postcodesSuppressed?: number; // # of postcodes omitted from published output
    // Cube schema version (Phase 9a).
    schema?: string;
  };
  tx: {
    byDept: TxDeptRow[];
    byRegion: TxAmountRow[];
    byTheme: TxAmountRow[];
    byStipulation: TxAmountRow[];
    byPayment: TxPaymentRow[];
    byDestination: TxAmountRow[];
    byMonth: TxMonthRow[];
    byCountry: TxAmountRow[];
    byPostcode?: TxPostcodeRow[];
    postcodeSuppressed?: { count: number; value: number };
  };
  donors: {
    total: number;
    totalLtv: number;
    byActivity: DonorNameRow[];
    byTier: DonorNameRow[];
    byType: DonorNameRow[];
    byConsent: DonorNameRow[];
    byDept: DonorDeptRow[];
    byRegion: DonorRegionRow[];
    byPostcode?: DonorPostcodeRow[];
    postcodeSuppressed?: { count: number };
  };
  // ---- Cube (DAY × theme) for drill-down + date-range filtering (Phase 9a) ----
  days?: string[];                         // sorted "YYYY-MM-DD" ascending (distinct donation days)
  months?: string[];                       // sorted "YYYY-MM" ascending (kept for labels)
  themes?: string[];                       // theme names sorted by full-period total desc
  cube?: CubeCell[];                       // one cell per (day, theme) that has data
  regionByDept?: Record<string, string>;   // dept code -> région name
  postcodeGlobal?: PostcodeGlobal;         // FULL period, suppressMinDonors=5 (heatmap)
}

export type DonverseView = 'overview' | 'map' | 'donors';
