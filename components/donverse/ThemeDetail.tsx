import React, { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, AreaChart, Area, Legend,
} from 'recharts';
import { ArrowLeft, Euro, Receipt, TrendingUp, Percent, CalendarCheck, Contact } from 'lucide-react';
import { DonverseData } from './types';
import { KpiCard } from './KpiCard';
import { ChartCard } from './ExportButtons';
import { CategoryDownloadBar } from './CategoryDownloadBar';
import { sliceCube } from '../../services/cube';
import type { DateRange } from './DateRangeBar';
import type { ExtractionFilters } from '../../lib/extractionExport';

// Pull a category name out of a recharts click payload (Pie / Bar).
const clickName = (d: any): string | undefined => d?.payload?.name ?? d?.name;
import { fmtEur, fmtEur2, fmtNum, fmtPct, fmtEurShort, fmtMonth, fmtMonthShort, MH, paletteAt } from './format';

interface ThemeDetailProps {
  data: DonverseData;
  theme: string;
  range: DateRange;
  /** Share of the whole (range) total this theme represents, 0..1. */
  shareOfTotal: number;
  onBack: () => void;
  /** Seed the Extraction tab pre-filtered to this cause. */
  onExtract?: (seed: Partial<ExtractionFilters>) => void;
}

export const ThemeDetail: React.FC<ThemeDetailProps> = ({ data, theme, range, shareOfTotal, onBack, onExtract }) => {
  const s = useMemo(() => sliceCube(data, range, theme), [data, range, theme]);
  const slugBase = `${theme}`;

  const months = useMemo(
    () => s.byMonth.map((m) => ({ ...m, label: fmtMonthShort(m.month) })),
    [s.byMonth]
  );
  const topCities = useMemo(() => s.byCity.slice(0, 10), [s.byCity]);
  const topDepts = useMemo(() => s.byDept.slice(0, 10), [s.byDept]);
  const destinations = useMemo(() => s.byDestination.slice(0, 10), [s.byDestination]);
  const payments = s.byPayment;

  return (
    <div className="space-y-6">
      {/* Header / back */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-emerald-700 border border-gray-200 hover:border-emerald-300 rounded-lg px-3 py-1.5 bg-white transition-colors"
        >
          <ArrowLeft size={16} /> Toutes les causes
        </button>
        <div className="flex items-center gap-3">
          {onExtract && (
            <button
              type="button"
              onClick={() => onExtract({ cause: [theme] })}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-[#28B8D8] hover:bg-[#1C8099] rounded-lg px-3 py-1.5 transition-colors"
            >
              <Contact size={14} /> Télécharger les donateurs de cette cause
            </button>
          )}
          <span className="text-xs text-gray-500">
            Période : <span className="font-medium text-gray-700">{fmtMonth(range.start)} → {fmtMonth(range.end)}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="inline-block w-2.5 h-8 rounded-full" style={{ backgroundColor: MH.green }} />
        <h2 className="text-2xl font-bold text-gray-900">{theme}</h2>
      </div>

      {s.count === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-500">
          Aucune donnée pour cette cause sur la période sélectionnée.
        </div>
      ) : (
      <>
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={Euro} label="Total collecté" value={fmtEur(s.total)} accent={paletteAt(0)} />
        <KpiCard icon={Receipt} label="Nombre de dons" value={fmtNum(s.count)} accent={paletteAt(1)} />
        <KpiCard icon={TrendingUp} label="Don moyen" value={fmtEur2(s.count ? s.total / s.count : 0)} accent={paletteAt(2)} />
        <KpiCard icon={Percent} label="% du total collecté" value={fmtPct(shareOfTotal * 100)} accent={paletteAt(3)} />
        <KpiCard
          icon={CalendarCheck}
          label="Meilleur mois"
          value={s.bestMonth ? fmtMonth(s.bestMonth.month) : '—'}
          hint={s.bestMonth ? fmtEur(s.bestMonth.amount) : undefined}
          accent={paletteAt(4)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stipulation donut */}
        <ChartCard title="Stipulation" sub={onExtract ? 'Cliquez une part pour télécharger ses donateurs' : 'Sadaqa / Zakat / …'} exportName={`${slugBase}-stipulation`}>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={s.byStipulation} dataKey="value" nameKey="name" innerRadius={70} outerRadius={120} paddingAngle={2}
                cursor={onExtract ? 'pointer' : undefined}
                onClick={(d: any) => { const n = clickName(d); if (n && onExtract) onExtract({ cause: [theme], stip: [n] }); }}>
                {s.byStipulation.map((_, i) => <Cell key={i} fill={paletteAt(i)} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmtEur(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          {onExtract && <CategoryDownloadBar label="Télécharger les donateurs par stipulation" items={s.byStipulation} onPick={(name) => onExtract({ cause: [theme], stip: [name] })} />}
        </ChartCard>

        {/* Payment methods */}
        <ChartCard
          title="Moyens de paiement"
          sub={onExtract ? 'Cliquez une barre pour télécharger ses donateurs · PA mis en évidence' : 'Le prélèvement automatique (PA) est mis en évidence'}
          exportName={`${slugBase}-paiement`}
          headerExtra={
            <span className="text-xs text-gray-500">PA : <span className="font-bold text-emerald-700">{fmtPct(s.paShare * 100)}</span></span>
          }
        >
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={payments} margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" height={70} />
              <YAxis tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#64748b' }} width={64} />
              <Tooltip formatter={(v: number) => fmtEur(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor={onExtract ? 'pointer' : undefined}
                onClick={(d: any) => { const n = clickName(d); if (n && onExtract) onExtract({ cause: [theme], pay: [n] }); }}>
                {payments.map((p, i) => <Cell key={i} fill={p.isPA ? MH.green : '#cbd5e1'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {onExtract && <CategoryDownloadBar label="Télécharger les donateurs par moyen de paiement" items={payments} onPick={(name) => onExtract({ cause: [theme], pay: [name] })} />}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Destinations */}
        <ChartCard title="Destinations" sub={onExtract ? 'Cliquez une barre pour télécharger ses donateurs' : 'Top 10 par montant collecté'} exportName={`${slugBase}-destinations`}>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={destinations} layout="vertical" margin={{ left: 10, right: 24 }}>
              <CartesianGrid horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#334155' }} />
              <Tooltip formatter={(v: number) => fmtEur(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} cursor={onExtract ? 'pointer' : undefined}
                onClick={(d: any) => { const n = clickName(d); if (n && onExtract) onExtract({ cause: [theme], dest: [n] }); }}>
                {destinations.map((_, i) => <Cell key={i} fill={paletteAt(i)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {onExtract && <CategoryDownloadBar label="Télécharger les donateurs par destination" items={destinations} onPick={(name) => onExtract({ cause: [theme], dest: [name] })} />}
        </ChartCard>

        {/* Top 10 cities */}
        <ChartCard title="Top 10 villes" sub={onExtract ? 'Cliquez une barre pour télécharger ses donateurs' : 'Là où le plus a été collecté (estimation top 30/mois)'} exportName={`${slugBase}-villes`}>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={topCities} layout="vertical" margin={{ left: 10, right: 24 }}>
              <CartesianGrid horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#334155' }} />
              <Tooltip formatter={(v: number) => fmtEur(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} cursor={onExtract ? 'pointer' : undefined}
                onClick={(d: any) => { const n = clickName(d); if (n && onExtract) onExtract({ cause: [theme], city: n }); }}>
                {topCities.map((_, i) => <Cell key={i} fill={paletteAt(i + 2)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {onExtract && <CategoryDownloadBar label="Télécharger les donateurs par ville" items={topCities} onPick={(name) => onExtract({ cause: [theme], city: name })} />}
        </ChartCard>
      </div>

      {/* Monthly area — full width */}
      <ChartCard title="Évolution mensuelle" sub="Montant collecté par mois" exportName={`${slugBase}-evolution`}>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={months} margin={{ left: 4, right: 16 }}>
            <defs>
              <linearGradient id="themeArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={MH.green} stopOpacity={0.35} />
                <stop offset="100%" stopColor={MH.green} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#64748b' }} width={64} />
            <Tooltip formatter={(v: number) => fmtEur(v)} labelFormatter={(l) => `Mois : ${l}`} />
            <Area type="monotone" dataKey="amount" stroke={MH.green} strokeWidth={2} fill="url(#themeArea)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Top 10 départements */}
      <ChartCard title="Top 10 départements" sub={onExtract ? 'Cliquez une barre pour télécharger ses donateurs' : 'Par montant collecté'} exportName={`${slugBase}-departements`}>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={topDepts} margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} />
            <YAxis tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#64748b' }} width={64} />
            <Tooltip formatter={(v: number) => fmtEur(v)} cursor={{ fill: '#f8fafc' }} labelFormatter={(l) => `Dépt ${l}`} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor={onExtract ? 'pointer' : undefined}
              onClick={(d: any) => { const code = d?.payload?.code; if (code && onExtract) onExtract({ cause: [theme], dept: code }); }}>
              {topDepts.map((_, i) => <Cell key={i} fill={paletteAt(i)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {onExtract && <CategoryDownloadBar label="Télécharger les donateurs par département" items={topDepts.map((d) => ({ name: d.code }))} onPick={(code) => onExtract({ cause: [theme], dept: code })} />}
      </ChartCard>
      </>
      )}
    </div>
  );
};
