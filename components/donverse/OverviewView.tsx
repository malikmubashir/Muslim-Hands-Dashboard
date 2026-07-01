import React, { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, AreaChart, Area, Legend,
} from 'recharts';
import {
  Euro, Receipt, TrendingUp, Users, CreditCard, HandHeart, MapPin, Sparkles, ChevronRight, Download,
} from 'lucide-react';
import { DonverseData } from './types';
import { KpiCard } from './KpiCard';
import { ChartCard } from './ExportButtons';
import { CategoryDownloadBar } from './CategoryDownloadBar';
import { sliceCube } from '../../services/cube';
import type { DateRange } from './DateRangeBar';
import type { ExtractionFilters } from '../../lib/extractionExport';
import { fmtEur, fmtEur2, fmtNum, fmtPct, fmtEurShort, fmtMonth, fmtMonthShort, MH, paletteAt } from './format';

interface OverviewProps {
  data: DonverseData;
  range: DateRange;
  onSelectTheme: (theme: string) => void;
  /** Download the donors behind a slice (date-range aware). */
  onExtract?: (seed: Partial<ExtractionFilters>) => void;
  /** Distinct donors who gave within the selected period (date-aware KPI). */
  donorsInPeriod?: number;
}

// Small inline "download these donors" icon button (per row / per slice).
const DlBtn: React.FC<{ onClick: (e: React.MouseEvent) => void; label?: string }> = ({ onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1C8099] hover:text-white hover:bg-[#28B8D8] border border-[#28B8D8]/40 hover:border-[#28B8D8] rounded-md px-2 py-1 transition-colors shrink-0"
    title="Télécharger les donateurs de cette sélection (période en cours)"
  >
    <Download size={13} /> {label ?? 'Télécharger'}
  </button>
);

// Pull a category name out of a recharts click payload (Pie / Bar).
const clickName = (d: any): string | undefined => d?.payload?.name ?? d?.name;

export const OverviewView: React.FC<OverviewProps> = ({ data, range, onSelectTheme, onExtract, donorsInPeriod }) => {
  const s = useMemo(() => sliceCube(data, range), [data, range]);

  const months = useMemo(
    () => s.byMonth.map((m) => ({ ...m, label: fmtMonthShort(m.month) })),
    [s.byMonth]
  );
  const destinations = useMemo(() => s.byDestination.slice(0, 8), [s.byDestination]);
  const payments = s.byPayment;
  const themeMax = s.byTheme.length ? s.byTheme[0].value : 1;
  const topCause = s.byTheme[0]?.name ?? '—';
  const topDest = s.byDestination[0]?.name ?? '—';
  const topDestVal = s.byDestination[0] ? fmtEur(s.byDestination[0].value) : undefined;

  return (
    <div className="space-y-6">
      {/* KPI row — range-aware */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Euro} label="Total collecté" value={fmtEur(s.total)} hint={`${fmtMonth(range.start)} → ${fmtMonth(range.end)}`} accent={paletteAt(0)} />
        <KpiCard icon={Receipt} label="Nombre de dons" value={fmtNum(s.donationCount)} accent={paletteAt(1)} />
        <KpiCard icon={TrendingUp} label="Don moyen" value={fmtEur2(s.avg)} accent={paletteAt(2)} />
        <KpiCard icon={Users} label="Donateurs" value={fmtNum(donorsInPeriod ?? data.meta?.distinctDonors ?? data.donors.total)} hint={donorsInPeriod != null ? 'distincts sur la période' : (data.meta?.distinctDonors != null ? 'ayant donné' : 'base totale')} accent={paletteAt(3)} />
        <KpiCard icon={HandHeart} label="Part Zakat" value={fmtPct(s.zakatShare * 100)} accent={paletteAt(4)} />
        <KpiCard icon={CreditCard} label="Part prélèvements (PA)" value={fmtPct(s.paShare * 100)} accent={paletteAt(5)} />
        <KpiCard icon={Sparkles} label="Top cause" value={topCause} accent={paletteAt(6)} />
        <KpiCard icon={MapPin} label="Top destination" value={topDest} hint={topDestVal} accent={paletteAt(7)} />
      </div>

      {/* Clickable themes list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Causes / Thèmes</h3>
            <p className="text-xs text-gray-400 mt-0.5">Cliquez une cause pour explorer le détail, ou « Télécharger » pour exporter ses donateurs (période en cours).</p>
          </div>
        </div>
        <ul className="divide-y divide-gray-50">
          {s.byTheme.map((t, i) => {
            const share = s.total ? (t.value / s.total) * 100 : 0;
            return (
              <li key={t.name} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectTheme(t.name)}
                  className="group flex-1 min-w-0 flex items-center gap-4 py-2.5 px-2 -mx-2 rounded-lg cursor-pointer hover:bg-emerald-50/60 transition-colors text-left"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: paletteAt(i) }} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-gray-800 truncate group-hover:text-emerald-800">{t.name}</span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">{fmtEur(t.value)}</span>
                    </span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <span className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden">
                        <span className="block h-full rounded-full" style={{ width: `${(t.value / themeMax) * 100}%`, backgroundColor: paletteAt(i) }} />
                      </span>
                      <span className="text-xs text-gray-400 tabular-nums w-12 text-right">{fmtPct(share)}</span>
                    </span>
                  </span>
                  <ChevronRight size={18} className="text-gray-300 group-hover:text-emerald-600 shrink-0" />
                </button>
                {onExtract && <DlBtn onClick={(e) => { e.stopPropagation(); onExtract({ cause: [t.name] }); }} />}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stipulation donut */}
        <ChartCard title="Répartition par stipulation" sub={onExtract ? 'Cliquez une part pour télécharger ses donateurs' : 'Sadaqa / Zakat / …'} exportName="tableau-stipulation">
          <ResponsiveContainer width="100%" height={340}>
            <PieChart>
              <Pie data={s.byStipulation} dataKey="value" nameKey="name" innerRadius={70} outerRadius={120} paddingAngle={2}
                cursor={onExtract ? 'pointer' : undefined}
                onClick={(d: any) => { const n = clickName(d); if (n && onExtract) onExtract({ stip: [n] }); }}>
                {s.byStipulation.map((_, i) => <Cell key={i} fill={paletteAt(i)} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmtEur(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          {onExtract && <CategoryDownloadBar label="Télécharger les donateurs par stipulation" items={s.byStipulation} onPick={(name) => onExtract({ stip: [name] })} />}
        </ChartCard>

        {/* Payment methods — highlight PA */}
        <ChartCard
          title="Moyens de paiement"
          sub={onExtract ? 'Cliquez une barre pour télécharger ses donateurs · PA mis en évidence' : 'Le prélèvement automatique (PA) est mis en évidence'}
          exportName="tableau-paiement"
          headerExtra={
            <span className="text-xs text-gray-500">PA : <span className="font-bold text-emerald-700">{fmtPct(s.paShare * 100)}</span></span>
          }
        >
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={payments} margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" height={70} />
              <YAxis tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#64748b' }} width={64} />
              <Tooltip formatter={(v: number) => fmtEur(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor={onExtract ? 'pointer' : undefined}
                onClick={(d: any) => { const n = clickName(d); if (n && onExtract) onExtract({ pay: [n] }); }}>
                {payments.map((p, i) => <Cell key={i} fill={p.isPA ? MH.green : '#cbd5e1'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {onExtract && <CategoryDownloadBar label="Télécharger les donateurs par moyen de paiement" items={payments} onPick={(name) => onExtract({ pay: [name] })} />}
        </ChartCard>
      </div>

      {/* Monthly area — full width */}
      <ChartCard title="Évolution mensuelle" sub="Montant collecté par mois" exportName="tableau-evolution">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={months} margin={{ left: 4, right: 16 }}>
            <defs>
              <linearGradient id="mhArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={MH.green} stopOpacity={0.35} />
                <stop offset="100%" stopColor={MH.green} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#64748b' }} width={64} />
            <Tooltip formatter={(v: number) => fmtEur(v)} labelFormatter={(l) => `Mois : ${l}`} />
            <Area type="monotone" dataKey="amount" stroke={MH.green} strokeWidth={2} fill="url(#mhArea)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Destinations — full width */}
      <ChartCard title="Top destinations" sub={onExtract ? 'Cliquez une barre pour télécharger ses donateurs (top 8)' : 'Top 8 par montant collecté'} exportName="tableau-destinations">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={destinations} layout="vertical" margin={{ left: 10, right: 24 }}>
            <CartesianGrid horizontal={false} stroke="#f1f5f9" />
            <XAxis type="number" tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11, fill: '#334155' }} />
            <Tooltip formatter={(v: number) => fmtEur(v)} cursor={{ fill: '#f8fafc' }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} cursor={onExtract ? 'pointer' : undefined}
              onClick={(d: any) => { const n = clickName(d); if (n && onExtract) onExtract({ dest: [n] }); }}>
              {destinations.map((_, i) => <Cell key={i} fill={paletteAt(i)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {onExtract && <CategoryDownloadBar label="Télécharger les donateurs par destination" items={destinations} onPick={(name) => onExtract({ dest: [name] })} />}
      </ChartCard>
    </div>
  );
};
