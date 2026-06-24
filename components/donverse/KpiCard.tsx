import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({ icon: Icon, label, value, hint }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-start gap-4">
    <div className="shrink-0 w-11 h-11 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
      <Icon size={22} />
    </div>
    <div className="min-w-0">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 leading-tight">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  </div>
);
