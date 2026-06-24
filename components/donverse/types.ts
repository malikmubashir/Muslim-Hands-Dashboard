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
    note?: string;
    // Postcode small-cell suppression (Phase 7a).
    suppressMinDonors?: number;
    postcodesSuppressed?: number; // # of postcodes omitted from published output
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
}

export type DonverseView = 'overview' | 'map' | 'donors';
