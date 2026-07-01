import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Map as MapIcon, Users, Loader2, AlertTriangle,
  RefreshCw, CheckCircle2, LucideIcon, Info,
} from 'lucide-react';
import { DonverseData, DonverseView } from './types';
import { OverviewView } from './OverviewView';
import { FranceMapView } from './FranceMapView';
import { DonorsView } from './DonorsView';
import { ThemeDetail } from './ThemeDetail';
import { DateRangeBar, DateRange } from './DateRangeBar';
import UpdateDataModal from './UpdateDataModal';
import PasswordGate from './PasswordGate';
import {
  loadDataset, LoadedDataset, DEV_BYPASS, checkPassword, getStoredPassword,
  getExtractionRecords, clearExtractionCache, type ExtractionRecord,
} from '../../services/donverseClient';
import { sliceCube } from '../../services/cube';
import { ExtractionFilters, downloadDonorsForSlice } from '../../lib/extractionExport';
import { useT, LangToggle } from './i18n';

const TABS: { key: DonverseView; labelKey: string; icon: LucideIcon }[] = [
  { key: 'overview', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { key: 'map', labelKey: 'nav.map', icon: MapIcon },
  { key: 'donors', labelKey: 'nav.donors', icon: Users },
];

const DonverseApp: React.FC = () => {
  const { t, lang } = useT();
  // ---- Shared-password gate (whole app) ----
  // In dev we bypass entirely; in prod we require a valid session password.
  const [unlocked, setUnlocked] = useState<boolean>(DEV_BYPASS);
  const [authChecked, setAuthChecked] = useState<boolean>(DEV_BYPASS);

  const [data, setData] = useState<DonverseData | null>(null);
  const [meta, setMeta] = useState<{ source: LoadedDataset['source']; lastUpdated: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DonverseView>('overview');
  const [showUpdate, setShowUpdate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // Decrypted gift-level contact records, warmed once after unlock. Kept in
  // memory only. Having them ready makes downloads fire synchronously inside the
  // click gesture (no browser activation timeout) and powers the date-aware
  // "Donateurs sur la période" KPI.
  const [records, setRecords] = useState<ExtractionRecord[] | null>(null);

  // Download the donors behind a slice, on the spot, scoped to the current
  // date range. The slice descriptor (seed) comes from whatever chart / list /
  // map zone the user clicked. Everything happens in the browser.
  const extractSlice = useCallback(async (seed: Partial<ExtractionFilters>) => {
    if (!range || exporting) return;
    setExporting(true);
    try {
      // Use the warmed cache if ready (synchronous → reliable save); otherwise
      // fetch+decrypt once, with a clear "preparing" message.
      let recs = records;
      if (!recs || recs.length === 0) {
        setToast(t('toast.preparingContacts'));
        recs = await getExtractionRecords();
        setRecords(recs);
      }
      if (!recs.length) {
        setToast(t('toast.noContacts'));
      } else {
        const n = downloadDonorsForSlice(recs, seed, range);
        setToast(n > 0 ? `${n.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')} ${t('toast.downloaded')}` : t('toast.noneSelection'));
      }
    } catch {
      setToast(t('toast.failed'));
    } finally {
      setExporting(false);
      setTimeout(() => setToast(null), 4000);
    }
  }, [range, exporting, records]);

  // Donateurs-tab downloads: donor-attribute slices over the FULL base, NOT
  // date-scoped (the tab is a snapshot). Includes giftless donors.
  const extractDonors = useCallback(async (seed: Partial<ExtractionFilters>) => {
    if (exporting) return;
    setExporting(true);
    try {
      let recs = records;
      if (!recs || recs.length === 0) {
        setToast(t('toast.preparingContacts'));
        recs = await getExtractionRecords();
        setRecords(recs);
      }
      if (!recs.length) {
        setToast(t('toast.noContacts'));
      } else {
        const n = downloadDonorsForSlice(recs, seed, { start: '', end: '' }, { allTime: true });
        setToast(n > 0 ? `${n.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')} ${t('toast.downloaded')}` : t('toast.noneSelection'));
      }
    } catch {
      setToast(t('toast.failed'));
    } finally {
      setExporting(false);
      setTimeout(() => setToast(null), 4000);
    }
  }, [exporting, records]);

  // Distinct donors who gave within the selected period (date-aware KPI).
  const donorsInPeriod = useMemo(() => {
    if (!records || records.length === 0 || !range) return undefined;
    const set = new Set<string>();
    let anon = 0;
    for (const r of records) {
      if (r.dt && r.dt >= range.start && r.dt <= range.end) set.add(r.ref || `__n${anon++}`);
    }
    return set.size;
  }, [records, range]);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    loadDataset()
      .then((res) => {
        setData(res.data);
        setMeta({ source: res.source, lastUpdated: res.lastUpdated });
        // Default the date range to the full available period (day-precision).
        const dateMin = res.data.meta?.dateMin;
        const dateMax = res.data.meta?.dateMax;
        if (dateMin && dateMax) {
          setRange({ start: dateMin, end: dateMax });
        } else {
          // Fallback for legacy datasets without day bounds: derive from months.
          const months = res.data.months || [];
          if (months.length) {
            setRange({ start: `${months[0]}-01`, end: `${months[months.length - 1]}-28` });
          }
        }
      })
      .catch((e: any) => {
        setError(String(e?.message || e));
      });
  }, []);

  // On mount (prod only): re-validate any password already in sessionStorage so
  // a returning tab skips the gate. If invalid/missing, show the gate.
  useEffect(() => {
    if (DEV_BYPASS) return;
    let alive = true;
    (async () => {
      const stored = getStoredPassword();
      if (stored && (await checkPassword(stored))) {
        if (alive) setUnlocked(true);
      }
      if (alive) setAuthChecked(true);
    })();
    return () => { alive = false; };
  }, []);

  // Load the dataset only once the app is unlocked.
  useEffect(() => {
    if (unlocked) load();
  }, [unlocked, load]);

  // Warm the decrypted contact records in the background after unlock so the
  // first download is instant and never blocked by the activation timeout.
  useEffect(() => {
    if (!unlocked) return;
    let alive = true;
    getExtractionRecords()
      .then((recs) => { if (alive) setRecords(recs); })
      .catch(() => { if (alive) setRecords([]); });
    return () => { alive = false; };
  }, [unlocked]);

  const onUpdated = useCallback(() => {
    setShowUpdate(false);
    setToast(t('toast.dataUpdated'));
    load();
    // A fresh extraction blob was just stored — drop the in-memory copy and
    // re-fetch it so downloads use the new data without a page reload.
    clearExtractionCache();
    setRecords(null);
    getExtractionRecords().then((recs) => setRecords(recs)).catch(() => setRecords([]));
    setTimeout(() => setToast(null), 3500);
  }, [load, t]);

  // Friendly data-source label.
  const dataLabel = (() => {
    const loc = lang === 'en' ? 'en-US' : 'fr-FR';
    if (!meta) return t('header.dataRef');
    const d = meta.lastUpdated ? new Date(meta.lastUpdated) : null;
    const when = d && !isNaN(d.getTime()) ? d.toLocaleDateString(loc) : '';
    if (meta.source === 'uploaded') return `${t('header.dataUpdated')} ${when}`;
    return `${t('header.dataRef')}${when ? ' · ' + when : ''}`;
  })();

  const months = data?.months || [];
  const hasCube = !!(data?.cube && data.cube.length && months.length);
  // Day-precision bounds for the calendar pickers (fallback to month-derived).
  const dateMin = data?.meta?.dateMin || (months.length ? `${months[0]}-01` : '');
  const dateMax = data?.meta?.dateMax || (months.length ? `${months[months.length - 1]}-28` : '');

  // Share of the selected theme over the whole range total (for drill-down KPI).
  const themeShare = useMemo(() => {
    if (!data || !range || !selectedTheme) return 0;
    const all = sliceCube(data, range);
    const th = all.byTheme.find((x) => x.name === selectedTheme);
    return all.total && th ? th.value / all.total : 0;
  }, [data, range, selectedTheme]);

  // ---- Gate rendering (prod only) ----
  if (!unlocked) {
    // While re-validating a stored password, show a brief loader to avoid a
    // flash of the gate for returning sessions.
    if (!authChecked) {
      return (
        <div className="min-h-screen flex items-center justify-center text-gray-400">
          <Loader2 size={22} className="animate-spin" />
        </div>
      );
    }
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header
        className="text-white shadow"
        style={{ backgroundImage: 'linear-gradient(to right, #28B8D8, #1C8099)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/brand/mhf-mark-white.png"
              alt="Muslim Hands France"
              className="h-10 w-10"
            />
            <div>
              <h1 className="text-xl font-bold leading-tight tracking-tight text-white">Muslim Hands France</h1>
              <p className="text-white/80 text-sm">{t('header.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <LangToggle />
            <span className="text-xs font-medium text-white bg-white/20 rounded-full px-3 py-1">
              {dataLabel}
            </span>
            <button
              onClick={() => setShowUpdate(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-white/20 hover:bg-white/30 rounded-full px-3 py-1.5 transition-colors"
            >
              <RefreshCw size={14} />
              {t('header.update')}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = view === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => { setView(tab.key); setSelectedTheme(null); }}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? 'border-white text-white'
                      : 'border-transparent text-white/75 hover:text-white hover:border-white/40'
                  }`}
                >
                  <Icon size={16} />
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
            <AlertTriangle size={20} />
            <span>{t('common.loadError')} {error}</span>
          </div>
        )}

        {!error && !data && (
          <div className="flex items-center justify-center gap-3 text-gray-500 py-32">
            <Loader2 size={22} className="animate-spin" />
            {t('common.loading')}
          </div>
        )}

        {data && range && (
          <div className="space-y-6">
            {/* Global date-range control — applies to Tableau de bord, Carte + drill-down */}
            {hasCube && (view === 'overview' || view === 'map') && (
              <DateRangeBar dateMin={dateMin} dateMax={dateMax} range={range} onChange={setRange} />
            )}

            {view === 'overview' && (
              hasCube ? (
                selectedTheme ? (
                  <ThemeDetail
                    data={data}
                    theme={selectedTheme}
                    range={range}
                    shareOfTotal={themeShare}
                    onBack={() => setSelectedTheme(null)}
                    onExtract={extractSlice}
                  />
                ) : (
                  <OverviewView data={data} range={range} onSelectTheme={setSelectedTheme} onExtract={extractSlice} donorsInPeriod={donorsInPeriod} />
                )
              ) : (
                <LegacyNotice />
              )
            )}
            {view === 'map' && (
              <FranceMapView data={data} range={hasCube ? range : undefined} onExtract={extractSlice} />
            )}
            {view === 'donors' && (
              <>
                <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <Info size={14} className="text-blue-500 shrink-0" />
                  {t('dn.snapshotNote')}
                </div>
                <DonorsView data={data} onExtract={extractDonors} />
              </>
            )}
          </div>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 pb-8 flex items-center gap-4 text-xs text-gray-400">
        <img src="/brand/mhf-logo.png" className="h-8" alt="Muslim Hands France" />
        {data && (
          <p>
            {t('foot.source')} : {data.meta.sources.join(', ')} · {t('foot.generatedOn')}{' '}
            {new Date(data.meta.generatedAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR')} · {t('foot.currency')} {data.meta.currency}
          </p>
        )}
      </footer>

      {showUpdate && (
        <UpdateDataModal onClose={() => setShowUpdate(false)} onUpdated={onUpdated} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-emerald-600 text-white text-sm font-medium rounded-full px-4 py-2 shadow-lg">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}
    </div>
  );
};

// Shown if the loaded dataset predates the cube (no month×theme breakdowns).
const LegacyNotice: React.FC = () => {
  const { t } = useT();
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-500">
      {t('legacy.notice')}
    </div>
  );
};

export default DonverseApp;
