import React, { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { Users, Activity, ShieldCheck, Wallet, Download } from 'lucide-react';
import { DonverseData } from './types';
import { KpiCard } from './KpiCard';
import { DonCard, SectionTitle } from './DonCard';
import { CategoryDownloadBar } from './CategoryDownloadBar';
import type { ExtractionFilters } from '../../lib/extractionExport';
import { fmtEur, fmtNum, fmtPct, MH, PALETTE } from './format';

export const DonorsView: React.FC<{
  data: DonverseData;
  /** Download donors for a segment (full base, all-time). */
  onExtract?: (seed: Partial<ExtractionFilters>) => void;
}> = ({ data, onExtract }) => {
  const d = data.donors;

  const totalActivity = d.byActivity.reduce((s, r) => s + r.count, 0);
  const actifs = d.byActivity.find((r) => r.name.toLowerCase().startsWith('actif'))?.count ?? 0;
  const actifPct = totalActivity ? (actifs / totalActivity) * 100 : 0;

  const totalConsent = d.byConsent.reduce((s, r) => s + r.count, 0);
  const optIn = d.byConsent.find((r) => r.name === 'Opt-In')?.count ?? 0;
  const optInPct = totalConsent ? (optIn / totalConsent) * 100 : 0;

  const topRegions = useMemo(
    () => [...d.byRegion].sort((a, b) => b.count - a.count).slice(0, 10),
    [d.byRegion]
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Total donateurs" value={fmtNum(d.total)} />
        <KpiCard icon={Activity} label="% actifs" value={fmtPct(actifPct)} hint={`${fmtNum(actifs)} actifs`} />
        <KpiCard icon={ShieldCheck} label="% Opt-In (RGPD)" value={fmtPct(optInPct)} hint="Taux de consentement" />
        <KpiCard icon={Wallet} label="LTV totale" value={fmtEur(d.totalLtv)} hint="Valeur vie cumulée" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity */}
        <DonCard>
          <SectionTitle sub="Actif / Inactif / Oublié">Activité des donateurs</SectionTitle>
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
          {onExtract && <CategoryDownloadBar label="Télécharger les donateurs par activité" items={d.byActivity} onPick={(name) => onExtract({ activite: [name] })} />}
        </DonCard>

        {/* Tier */}
        <DonCard>
          <SectionTitle sub="Kind / Engaged / Generous / Major">Paliers de générosité</SectionTitle>
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
          {onExtract && <CategoryDownloadBar label="Télécharger les donateurs par palier" items={d.byTier} onPick={(name) => onExtract({ palier: [name] })} />}
        </DonCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Type donut */}
        <DonCard>
          <SectionTitle sub="Individual / Organization">Type de donateur</SectionTitle>
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
          {onExtract && <CategoryDownloadBar label="Télécharger les donateurs par type" items={d.byType} onPick={(name) => onExtract({ type: [name] })} />}
        </DonCard>

        {/* Consent donut */}
        <DonCard>
          <SectionTitle sub="RGPD — Opt-In mis en évidence">Consentement</SectionTitle>
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
          {onExtract && <CategoryDownloadBar label="Télécharger les donateurs par consentement (courrier)" items={d.byConsent} onPick={(name) => onExtract({ pcat: [name] })} />}
        </DonCard>

        {/* Top regions list */}
        <DonCard>
          <SectionTitle sub="Par nombre de donateurs">Top 10 régions</SectionTitle>
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
                      title={`Télécharger les donateurs : ${r.name}`}
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
