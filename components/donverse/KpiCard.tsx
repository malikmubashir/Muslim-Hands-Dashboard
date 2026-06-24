import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  /** Accent color for the icon chip (defaults to brand turquoise). */
  accent?: string;
}

// Convert a hex color to an rgba() string with the given alpha.
const tint = (hex: string, alpha: number) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const KpiCard: React.FC<KpiCardProps> = ({ icon: Icon, label, value, hint, accent = '#28B8D8' }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-start gap-4">
    <div
      className="shrink-0 w-11 h-11 rounded-lg flex items-center justify-center"
      style={{ backgroundColor: tint(accent, 0.12), color: accent }}
    >
      <Icon size={22} />
    </div>
    <div className="min-w-0">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 leading-tight">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  </div>
);
