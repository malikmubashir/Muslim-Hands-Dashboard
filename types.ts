export interface DonationRecord {
  "Donation Date": string;
  "Amount": string;
  "Thème": string;
  "Requête": string;
  "Localité": string;
  "Account Postal Region": string;
  "Allocation Summary": string;
  "Income Type": string;
  [key: string]: string;
}

export interface ChartData {
  name: string;
  value: number;
  count: number;
  label?: string; // For formatted dates
  date?: string; // For raw dates
  [key: string]: any;
}

export interface DashboardStats {
  totalAmount: number;
  totalDonations: number;
  avgDonation: number;
  byTheme: ChartData[];
  byType: ChartData[];
  byProject: ChartData[];
  byIncomeType: ChartData[];
  byCountry: ChartData[];
  byRegion: ChartData[];
  byDate: { date: string; amount: number; count: number; label: string }[];
}

export type Language = 'fr' | 'en' | 'ur';

export interface TranslationSet {
  title: string;
  subtitle: string;
  import: string;
  change: string;
  aiAssistant: string;
  reportMode: string;
  period: string;
  totalCollected: string;
  totalDonations: string;
  avgDonation: string;
  topCause: string;
  deepDiveTitle: string;
  deepDiveSubtitle: string;
  causeSelected: string;
  breakdown: string;
  monthlyTrend: string;
  globalView: string;
  fundType: string;
  topDestinations: string;
  topProjects: string;
  noData: string;
  noDataSub: string;
  reset: string;
  aiWelcome: string;
  aiPlaceholder: string;
  aiThinking: string;
  funnel: string;
  bars: string;
  subtextKpi1: string;
  subtextKpi2: string;
  subtextKpi3: string;
  subtextKpi4: string;
  exportJpg: string;
  analysis: string;
  story: string;
  chat: string;
  send: string;
  quickPrompt1: string;
  quickPrompt2: string;
  quickPrompt3: string;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface DateBounds {
  min: string;
  max: string;
}