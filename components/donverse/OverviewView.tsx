import React, { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, AreaChart, Area, Legend,
} from 'recharts';
import { Euro, Receipt, TrendingUp, Users } from 'lucide-react';
import { DonverseData } from './types';
import { KpiCard } from './KpiCard';
import { DonCard, SectionTitle } from './DonCard';
import { fmtEur, fmtEur2, fmtNum, fmtPct, fmtEurShort, MH, PALETTE } from './format';

const monthLabel = (m: string) => {
  const [y, mm] = m.split('-');
  const names = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${names[parseInt(mm, 10) - 1]} ${y.slice(2)}`;
};

export const OverviewView: React.FC<{ data: DonverseData }> = ({ data }) => {
  const { meta, tx } = data;
  const avg = meta.txRows ? meta.txTotalBase / meta.txRows : 0;

  const themes = useMemo(
    () => [...tx.byTheme].sort((a, b) => b.value - a.value).slice(0, 10),
    [tx.byTheme]
  );
  const destinations = useMemo(
    () => [...tx.byDestination].sort((a, b) => b.value - a.value).slice(0, 8),
    [tx.byDestination]
  );
  const payments = useMemo(() => [...tx.byPayment].sort((a, b) => b.value - a.value), [tx.byPayment]);
  const months = useMemo(
    () => tx.byMonth.map((m) => ({ ...m, label: monthLabel(m.month) })),
    [tx.byMonth]
  );

  const paTotal = useMemo(
    () => tx.byPayment.filter((p) => p.isPA).reduce((s, p) => s + p.value, 0),
    [tx.byPayment]
  );
  const paPct = meta.txTotalBase ? (paTotal / meta.txTotalBase) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Euro} label="Total collecté" value={fmtEur(meta.txTotalBase)} hint={`${meta.monthMin} → ${meta.monthMax}`} />
        <KpiCard icon={Receipt} label="Nombre de dons" value={fmtNum(meta.txRows)} />
        <KpiCard icon={TrendingUp} label="Don moyen" value={fmtEur2(avg)} />
        <KpiCard icon={Users} label="Donateurs" value={fmtNum(data.donors.total)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Themes */}
        <DonCard>
          <SectionTitle sub="Top 10 par montant collecté">Causes / Thèmes</SectionTitle>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={themes} layout="vertical" margin={{ left: 10, right: 24 }}>
              <CartesianGrid horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: '#334155' }} />
              <Tooltip formatter={(v: number) => fmtEur(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="value" fill={MH.green} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DonCard>

        {/* Stipulation donut */}
        <DonCard>
          <SectionTitle sub="Répartition par montant">Stipulation (Sadaqa / Zakat / …)</SectionTitle>
          <ResponsiveContainer width="100%" height={360}>
            <PieChart>
              <Pie
                data={tx.byStipulation}
                dataKey="value"
                nameKey="name"
                innerRadius={70}
                outerRadius={120}
                paddingAngle={2}
              >
                {tx.byStipulation.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => fmtEur(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </DonCard>
      </div>

      {/* Monthly area — full width */}
      <DonCard>
        <SectionTitle sub="Montant collecté par mois">Évolution mensuelle</SectionTitle>
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
      </DonCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment methods — highlight PA */}
        <DonCard>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Moyens de paiement</h3>
              <p className="text-xs text-gray-400 mt-0.5">Le prélèvement automatique (PA) est mis en évidence</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-gray-500">Prélèvements auto. (PA)</p>
              <p className="text-lg font-bold text-emerald-700">{fmtPct(paPct)}</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={payments} margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" height={70} />
              <YAxis tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#64748b' }} width={64} />
              <Tooltip formatter={(v: number) => fmtEur(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {payments.map((p, i) => (
                  <Cell key={i} fill={p.isPA ? MH.green : '#cbd5e1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </DonCard>

        {/* Destinations */}
        <DonCard>
          <SectionTitle sub="Top 8 par montant collecté">Destinations</SectionTitle>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={destinations} layout="vertical" margin={{ left: 10, right: 24 }}>
              <CartesianGrid horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#334155' }} />
              <Tooltip formatter={(v: number) => fmtEur(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="value" fill={MH.greenMid} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DonCard>
      </div>
    </div>
  );
};
