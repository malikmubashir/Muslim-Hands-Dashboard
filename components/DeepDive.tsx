import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, AreaChart, Area, LabelList
} from 'recharts';
import { Briefcase, Filter, Layers, TrendingUp } from 'lucide-react';

import { DashboardStats, Language, TranslationSet, DateRange } from '../types';
import { COLORS, THEME_COLORS } from '../constants';
import { Card } from './ui/Card';
import { CustomTooltip } from './charts/CustomTooltip';
import { getPeriodString } from '../lib/format';

interface Formatters {
  formatCurrency: (val: number) => string;
  formatShortCurrency: (val: number) => string;
}

interface DeepDiveStats {
  bySubType: { name: string; value: number; count: number }[];
  trendByMonth: any[];
  totalDeepDiveAmount: number;
  totalDeepDiveCount: number;
}

interface DeepDiveProps {
  stats: DashboardStats;
  deepDiveStats: DeepDiveStats | null;
  selectedDeepDiveTheme: string;
  setSelectedDeepDiveTheme: (theme: string) => void;
  exportMode: boolean;
  lang: Language;
  t: TranslationSet;
  formatters: Formatters;
  filterDates: DateRange;
}

export const DeepDive: React.FC<DeepDiveProps> = ({
  stats, deepDiveStats, selectedDeepDiveTheme, setSelectedDeepDiveTheme,
  exportMode, lang, t, formatters, filterDates,
}) => {
  const { formatCurrency, formatShortCurrency } = formatters;

  return (
    <div className="mt-8 border-t border-gray-200 pt-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
         <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
               <Briefcase className="text-indigo-600" size={24}/>
               {t.deepDiveTitle}
            </h2>
            <p className="text-sm text-gray-500">{t.deepDiveSubtitle}</p>
         </div>
         <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-300 shadow-sm">
            <Filter size={16} className="text-gray-500" />
            <select
              value={selectedDeepDiveTheme}
              onChange={(e) => setSelectedDeepDiveTheme(e.target.value)}
              className="bg-transparent border-none outline-none text-gray-700 font-medium cursor-pointer text-sm"
            >
              {stats.byTheme.map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
         </div>
      </div>

      {deepDiveStats && (
        <div className="space-y-6">
           {/* Summary Bar */}
           <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 flex flex-wrap gap-8 items-center">
              <div className="flex items-center gap-3">
                 <div className="bg-indigo-100 p-2 rounded-full text-indigo-600">
                    <Layers size={20} />
                 </div>
                 <div>
                    <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide">{t.causeSelected}</p>
                    <p className="text-lg font-bold text-gray-800">{selectedDeepDiveTheme}</p>
                 </div>
              </div>
              <div className="w-px h-10 bg-indigo-200 hidden sm:block"></div>
              <div>
                 <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.totalCollected}</p>
                 <p className="text-xl font-bold text-green-600">{formatCurrency(deepDiveStats.totalDeepDiveAmount)}</p>
              </div>
              <div className="w-px h-10 bg-indigo-200 hidden sm:block"></div>
              <div>
                 <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.totalDonations}</p>
                 <p className="text-xl font-bold text-blue-600">{deepDiveStats.totalDeepDiveCount}</p>
              </div>
           </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Breakdown */}
            <Card id="chart-subtype" title={`${t.breakdown} : ${selectedDeepDiveTheme}`} lang={lang}>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Layers size={18} className="text-blue-600" />
                    {t.breakdown}
                  </h3>
                  {exportMode && <p className="text-xs text-gray-500 mt-1">{getPeriodString(filterDates)}</p>}
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  {deepDiveStats.bySubType.length > 0 ? (
                      <BarChart data={deepDiveStats.bySubType} layout="vertical" margin={{ top: 5, right: exportMode ? 80 : 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={140} tick={{fontSize: 11}} />
                        <RechartsTooltip content={<CustomTooltip lang={lang} />} cursor={{fill: 'transparent'}} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24} fill="#3B82F6">
                          {exportMode && <LabelList dataKey="value" position="right" formatter={formatShortCurrency} style={{ fontSize: '11px', fontWeight: 'bold', fill: '#333' }} />}
                          {deepDiveStats.bySubType.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={THEME_COLORS[selectedDeepDiveTheme] || COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">{t.noData}</div>
                  )}
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Chart 2: Monthly */}
            <Card id="chart-monthly" title={`${t.monthlyTrend} : ${selectedDeepDiveTheme}`} lang={lang}>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <TrendingUp size={18} className="text-green-600" />
                    {t.monthlyTrend}
                  </h3>
                  {exportMode && <p className="text-xs text-gray-500 mt-1">{getPeriodString(filterDates)}</p>}
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  {deepDiveStats.trendByMonth.length > 0 ? (
                    // @ts-ignore
                    <AreaChart data={deepDiveStats.trendByMonth}>
                      <defs>
                        <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={THEME_COLORS[selectedDeepDiveTheme] || '#3B82F6'} stopOpacity={0.1}/>
                          <stop offset="95%" stopColor={THEME_COLORS[selectedDeepDiveTheme] || '#3B82F6'} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="label" tick={{fontSize: 12}} />
                      <YAxis tick={{fontSize: 12}} tickFormatter={(val: any) => `€${val}`} />
                      <RechartsTooltip content={<CustomTooltip lang={lang} />} />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        stroke={THEME_COLORS[selectedDeepDiveTheme] || '#3B82F6'}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorTrend)"
                      >
                        {exportMode && <LabelList dataKey="amount" position="top" formatter={formatShortCurrency} style={{ fontSize: '11px', fontWeight: 'bold', fill: '#333' }} />}
                      </Area>
                    </AreaChart>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">{t.noData}</div>
                  )}
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};
