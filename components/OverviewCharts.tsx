import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, Cell, FunnelChart, Funnel, LabelList, PieChart, Pie
} from 'recharts';
import { Filter, Droplets, BarChart2 } from 'lucide-react';

import { DashboardStats, Language, TranslationSet, DateRange } from '../types';
import { COLORS, THEME_COLORS } from '../constants';
import { Card } from './ui/Card';
import { CustomTooltip } from './charts/CustomTooltip';
import { getPeriodString } from '../lib/format';

interface Formatters {
  formatCurrency: (val: number) => string;
  formatShortCurrency: (val: number) => string;
}

interface OverviewChartsProps {
  stats: DashboardStats;
  exportMode: boolean;
  lang: Language;
  t: TranslationSet;
  formatters: Formatters;
  filterDates: DateRange;
}

export const OverviewCharts: React.FC<OverviewChartsProps> = ({
  stats, exportMode, lang, t, formatters, filterDates,
}) => {
  const [themeViewMode, setThemeViewMode] = useState<'funnel' | 'bar'>('funnel');
  const { formatShortCurrency } = formatters;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6 border-t border-gray-200">
      <Card className="lg:col-span-2" id="chart-global" title={t.globalView} lang={lang}>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              {themeViewMode === 'funnel' ? <Filter size={18} className="text-blue-500" /> : <Droplets size={18} className="text-blue-500" />}
              {t.globalView} {themeViewMode === 'funnel' ? `(${t.funnel})` : `(${t.bars})`}
            </h3>
            {exportMode && <p className="text-xs text-gray-500 mt-1">{getPeriodString(filterDates)}</p>}
          </div>
          <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
            <button onClick={() => setThemeViewMode('bar')} className={`p-1.5 rounded-md transition-all ${themeViewMode === 'bar' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}><BarChart2 size={16} /></button>
            <button onClick={() => setThemeViewMode('funnel')} className={`p-1.5 rounded-md transition-all ${themeViewMode === 'funnel' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}><Filter size={16} /></button>
          </div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            {themeViewMode === 'funnel' ? (
              <FunnelChart>
                <RechartsTooltip content={<CustomTooltip lang={lang} />} />
                <Funnel dataKey="value" data={stats.byTheme} isAnimationActive>
                  <LabelList position="right" fill="#666" stroke="none" dataKey="name" />
                  {exportMode && <LabelList position="left" fill="#666" stroke="none" dataKey="value" formatter={formatShortCurrency} />}
                  {stats.byTheme.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={THEME_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                  ))}
                </Funnel>
              </FunnelChart>
            ) : (
              <BarChart data={stats.byTheme} layout="vertical" margin={{ top: 5, right: exportMode ? 80 : 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 12}} />
                <RechartsTooltip content={<CustomTooltip lang={lang} />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30}>
                  {exportMode && <LabelList dataKey="value" position="right" formatter={formatShortCurrency} style={{ fontSize: '11px', fontWeight: 'bold', fill: '#333' }} />}
                  {stats.byTheme.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={THEME_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>

      <Card id="chart-types" title={t.fundType} lang={lang}>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Filter size={18} className="text-purple-500" />
              {t.fundType}
            </h3>
            {exportMode && <p className="text-xs text-gray-500 mt-1">{getPeriodString(filterDates)}</p>}
          </div>
        </div>
        <div className="h-80 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.byType}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                labelLine={exportMode ? { stroke: '#333', strokeWidth: 1 } : false}
                label={exportMode ? ({name, percent, cx, cy, midAngle, outerRadius}: any) => {
                  const radius = outerRadius * 1.3;
                  const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
                  const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
                  return (
                    <text
                        x={x}
                        y={y}
                        fill="#333"
                        textAnchor={x > cx ? 'start' : 'end'}
                        dominantBaseline="central"
                        style={{ fontSize: '11px', fontWeight: 'bold' }}
                    >
                      {`${name} (${(percent * 100).toFixed(0)}%)`}
                    </text>
                  );
                } : false}
              >
                {stats.byType.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip content={<CustomTooltip lang={lang} />} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};
