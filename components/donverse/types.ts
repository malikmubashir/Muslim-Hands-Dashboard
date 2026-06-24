// DONVERSE data shapes — mirrors public/data/donverse.json

export interface TxAmountRow { name: string; value: number; count: number; }
export interface TxDeptRow { code: string; value: number; count: number; }
export interface TxPaymentRow { name: string; value: number; count: number; isPA: boolean; }
export interface TxMonthRow { month: string; amount: number; count: number; }

export interface DonorNameRow { name: string; count: number; }
export interface DonorDeptRow { code: string; count: number; active: number; ltv: number; }
export interface DonorRegionRow { name: string; count: number; active: number; ltv: number; }

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
  };
}

export type DonverseView = 'overview' | 'map' | 'donors';
