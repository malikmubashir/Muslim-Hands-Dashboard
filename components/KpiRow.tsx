import React from 'react';
import { DollarSign, Activity, Users, Heart } from 'lucide-react';

import { DashboardStats, TranslationSet } from '../types';
import { StatCard } from './StatCard';

interface KpiRowProps {
  stats: DashboardStats;
  t: TranslationSet;
  formatCurrency: (val: number) => string;
}

export const KpiRow: React.FC<KpiRowProps> = ({ stats, t, formatCurrency }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title={t.totalCollected}
        value={formatCurrency(stats.totalAmount)}
        subtext={t.subtextKpi1}
        icon={DollarSign}
        color="bg-green-600"
      />
      <StatCard
        title={t.totalDonations}
        value={stats.totalDonations.toLocaleString()}
        subtext={t.subtextKpi2}
        icon={Activity}
        color="bg-blue-500"
      />
      <StatCard
        title={t.avgDonation}
        value={formatCurrency(stats.avgDonation)}
        subtext={t.subtextKpi3}
        icon={Users}
        color="bg-purple-500"
      />
      <StatCard
        title={t.topCause}
        value={stats.byTheme[0]?.name || '-'}
        subtext={`${formatCurrency(stats.byTheme[0]?.value || 0)}`}
        icon={Heart}
        color="bg-pink-500"
      />
    </div>
  );
};
