import React, { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend, ComposedChart, Line,
} from 'recharts';
import { Users, UserPlus, Repeat, Coins, ShieldCheck, Download } from 'lucide-react';
import { DonverseData } from './types';
import type { DateRange } from './DateRangeBar';
import type { ExtractionRecord } from '../../services/donverseClient';
import { KpiCard } from './KpiCard';
import { DonCard, SectionTitle } from './DonCard';
import { CategoryDownloadBar } from './CategoryDownloadBar';
import type { ExtractionFilters } from '../../lib/extractionExport';
import { useT } from './i18n';
import { fmtEur, fmtNum, fmtPct, MH, PALETTE } from './format';

export const DonorsView: React.FC<{
  data: DonverseData;
  /** Decrypted gift-level records (warmed after unlock) — enable date-aware KPIs. */
  records?: ExtractionRecord[] | null;
  /** Selected date range (shared with the other tabs). */
  range?: DateRange | null;
  /** Download donors for a segment (full base, all-time). */
  onExtract?: (seed: Partial<ExtractionFilters>) => void;
}> = ({ data, records, range, onExtract }) => {
  const { t } = useT();
  const d = data.donors;

  // Snapshot consent rate (fallback while records are still warming).
  const totalConsent = d.byConsent.reduce((s, r) => s + r.count, 0);
  const optIn = d.byConsent.find((r) => r.name === 'Opt-In')?.count ?? 0;
  const optInPct = totalConsent ? (optIn / totalConsent) * 100 : 0;

  // ---- Date-aware KPIs, computed from gift-level records over the selected range ----
  const period = useMemo(() => {
    if (!records || records.length === 0 || !range) return null;

    // First-ever gift date per donor (whole base) → identifies NEW donors.
    const firstGift = new Map<string, string>();
    for (const r of records) {
      if (!r.ref || !r.dt) continue;
      const prev = firstGift.get(r.ref);
      if (!prev || r.dt < prev) firstGift.set(r.ref, r.dt);
    }

    // Activity inside the selected range.
    const active = new Set<string>();
    let amount = 0;
    let gifts = 0;
    let anon = 0;
    for (const r of records) {
      if (!r.dt || r.dt < range.start || r.dt > range.end) continue;
      active.add(r.ref || `__n${anon++}`);
      amount += r.amt || 0;
      gifts += 1;
    }

    // Per-donor attributes among identified period donors.
    let newDonors = 0;
    let optInPeriod = 0;
    const seen = new Set<string>();
    for (const r of records) {
      const ref = r.ref;
      if (!ref || seen.has(ref) || !active.has(ref)) continue;
      seen.add(ref);
      const first = firstGift.get(ref);
      if (first && first >= range.start) newDonors += 1;
      if (r.pcat === 'Opt-In') optInPeriod += 1;
    }
    const returning = Math.max(0, seen.size - newDonors);

    return {
      donors: active.size,
      identified: seen.size, // donors with a stable ref (denominator for shares)
      newDonors,
      returning,
      optInPct: seen.size ? (optInPeriod / seen.size) * 100 : 0,
      amount,
      gifts,
    };
  }, [records, range]);

  const topRegions = useMemo(
    () => [...d.byRegion].sort((a, b) => b.count - a.count).slice(0, 10),
    [d.byRegion]
  );

  // ---- PA (Direct Debit) monthly dynamics, cumulative computed over the FULL
  // series then windowed to the selected date range (so the cumulative line
  // stays correct regardless of the visible window). ----
  const paSeries = useMemo(() => {
    const monthly = data.pa?.monthly ?? [];
    if (monthly.length === 0) return [];
    let cumul = 0;
    const full = monthly.map((r) => {
      cumul += r.started - r.stopped;
      return { ...r, solde: r.started - r.stopped, cumul };
    });
    if (!range) return full;
    const mStart = range.start.slice(0, 7);
    const mEnd = range.end.slice(0, 7);
    return full.filter((r) => r.month >= mStart && r.month <= mEnd);
  }, [data.pa, range]);

  const GENRE_COLORS: Record<string, string> = {
    Femme: '#ec4899',
    Homme: '#3b82f6',
    Couple: '#7c3aed',
    'Non déterminé': '#94a3b8',
  };

  return (
    <div className="space-y-6">
      {/* KPIs — follow the selected date range (charts below are full-base snapshots) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard
          icon={Users}
          label={t('dn.donorsPeriod')}
          value={fmtNum(period ? period.donors : d.total)}
          hint={period ? `${fmtNum(d.total)} ${t('dn.baseSuffix')}` : t('dn.wholeBase')}
        />
        <KpiCard
          icon={UserPlus}
          label={t('dn.newDonors')}
          value={period ? fmtNum(period.newDonors) : '—'}
          hint={period && period.identified
            ? `${fmtPct((period.newDonors / period.identified) * 100)} ${t('dn.ofPeriodDonors')}`
            : t('dn.needRecords')}
        />
        <KpiCard
          icon={Repeat}
          label={t('dn.returningDonors')}
          value={period && period.identified ? fmtPct((period.returning / period.identified) * 100) : '—'}
          hint={period ? `${fmtNum(period.returning)} ${t('dn.returningHint')}` : t('dn.needRecords')}
        />
        <KpiCard
          icon={Coins}
          label={t('dn.avgPerDonor')}
          value={period && period.donors ? fmtEur(period.amount / period.donors) : '—'}
          hint={period && period.gifts ? `${t('dn.avgGift')} ${fmtEur(period.amount / period.gifts)}` : t('dn.needRecords')}
        />
        <KpiCard
          icon={ShieldCheck}
          label={t('dn.pctOptIn')}
          value={fmtPct(period ? period.optInPct : optInPct)}
          hint={period ? t('dn.consentPeriod') : t('dn.consentRate')}
        />
      </div>

      {/* PA (Direct Debit) monthly dynamics — follows the selected date range */}
      {paSeries.length > 0 && data.pa && (
        <DonCard>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SectionTitle sub={t('dn.paSub')}>{t('dn.paTitle')}</SectionTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1">
                {t('dn.paActive')} ({fmtNum(data.pa.active)})
              </span>
              <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-md px-2.5 py-1">
                {t('dn.paStopped')} ({fmtNum(data.pa.stopped)})
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={paSeries} margin={{ left: 8, right: 8 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={28} />
              <YAxis yAxisId="left" tickFormatter={fmtNum} tick={{ fontSize: 11, fill: '#64748b' }} width={48} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={fmtNum} tick={{ fontSize: 11, fill: '#7c3aed' }} width={52} />
              <Tooltip formatter={(v: number) => fmtNum(v)} cursor={{ fill: '#f8fafc' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="started" name={t('dn.paStarted')} fill={MH.green} radius={[2, 2, 0, 0]} />
              <Bar yAxisId="left" dataKey="stopped" name={t('dn.paStoppedLegend')} fill="#f4a09c" radius={[2, 2, 0, 0]} />
              <Line yAxisId="left" type="monotone" dataKey="solde" name={t('dn.paNet')} stroke="#dc2626" strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="cumul" name={t('dn.paCumul')} stroke="#7c3aed" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </DonCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity */}
        <DonCard>
          <SectionTitle sub={t('dn.activitySub')}>{t('dn.activityTitle')}</SectionTitle>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={d.byActivity} margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" height={56} />
              <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: '#64748b' }} width={56} />
              <Tooltip formatter={(v: number) => fmtNum(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {d.byActivity.map((r, i) => (
                  <Cell key={i} fill={r.name.toLowerCase().startsWith('actif') ? MH.green : PALETTE[(i + 3) % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {onExtract && <CategoryDownloadBar label={t('dn.dlByActivity')} items={d.byActivity} onPick={(name) => onExtract({ activite: [name] })} />}
        </DonCard>

        {/* Tier */}
        <DonCard>
          <SectionTitle sub={t('dn.tierSub')}>{t('dn.tierTitle')}</SectionTitle>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={d.byTier} margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" height={56} />
              <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: '#64748b' }} width={56} />
              <Tooltip formatter={(v: number) => fmtNum(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {d.byTier.map((_, i) => (
                  <Cell key={i} fill={[MH.greenLight, MH.greenMid, MH.green, MH.greenDark][i % 4]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {onExtract && <CategoryDownloadBar label={t('dn.dlByTier')} items={d.byTier} onPick={(name) => onExtract({ palier: [name] })} />}
        </DonCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Genre donut (Femme / Homme / Couple) */}
        {d.byGenre && d.byGenre.length > 0 && (
          <DonCard>
            <SectionTitle sub={t('dn.genreSub')}>{t('dn.genreTitle')}</SectionTitle>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={d.byGenre} dataKey="count" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {d.byGenre.map((r, i) => (
                    <Cell key={i} fill={GENRE_COLORS[r.name] ?? PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtNum(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            {onExtract && <CategoryDownloadBar label={t('dn.dlByGenre')} items={d.byGenre} onPick={(name) => onExtract({ genre: [name] })} />}
          </DonCard>
        )}

        {/* Type donut */}
        <DonCard>
          <SectionTitle sub={t('dn.typeSub')}>{t('dn.typeTitle')}</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={d.byType} dataKey="count" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                {d.byType.map((_, i) => (
                  <Cell key={i} fill={[MH.green, '#94a3b8'][i % 2]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => fmtNum(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          {onExtract && <CategoryDownloadBar label={t('dn.dlByType')} items={d.byType} onPick={(name) => onExtract({ type: [name] })} />}
        </DonCard>

        {/* Consent donut */}
        <DonCard>
          <SectionTitle sub={t('dn.consentSub')}>{t('dn.consentTitle')}</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={d.byConsent} dataKey="count" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                {d.byConsent.map((r, i) => (
                  <Cell key={i} fill={r.name === 'Opt-In' ? MH.green : PALETTE[(i + 5) % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => fmtNum(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          {onExtract && <CategoryDownloadBar label={t('dn.dlByConsent')} items={d.byConsent} onPick={(name) => onExtract({ pcat: [name] })} />}
        </DonCard>

        {/* Top regions list */}
        <DonCard>
          <SectionTitle sub={t('dn.regionsSub')}>{t('dn.regionsTitle')}</SectionTitle>
          <ol className="space-y-1.5">
            {topRegions.map((r, i) => (
              <li key={r.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-5 text-xs text-gray-400 tabular-nums">{i + 1}.</span>
                  <span className="truncate text-gray-700">{r.name}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold text-gray-900 tabular-nums">{fmtNum(r.count)}</span>
                  {onExtract && (
                    <button
                      type="button"
                      onClick={() => onExtract({ dregion: r.name })}
                      className="inline-flex items-center text-[#1C8099] hover:text-white hover:bg-[#28B8D8] border border-[#28B8D8]/30 hover:border-[#28B8D8] rounded-md p-1 transition-colors"
                      title={`${t('common.downloadDonors')} : ${r.name}`}
                    >
                      <Download size={13} />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </DonCard>
      </div>
    </div>
  );
};
