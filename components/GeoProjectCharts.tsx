import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LabelList
} from 'recharts';
import { MapPin, Briefcase } from 'lucide-react';

import { DashboardStats, Language, TranslationSet, DateRange } from '../types';
import { Card } from './ui/Card';
import { CustomTooltip } from './charts/CustomTooltip';
import { getPeriodString } from '../lib/format';

interface Formatters {
  formatCurrency: (val: number) => string;
  formatShortCurrency: (val: number) => string;
}

interface GeoProjectChartsProps {
  stats: DashboardStats;
  exportMode: boolean;
  lang: Language;
  t: TranslationSet;
  formatters: Formatters;
  filterDates: DateRange;
}

export const GeoProjectCharts: React.FC<GeoProjectChartsProps> = ({
  stats, exportMode, lang, t, formatters, filterDates,
}) => {
  const { formatShortCurrency } = formatters;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
       <Card id="chart-geo" title={t.topDestinations} lang={lang}>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <MapPin size={18} className="text-red-500" />
              {t.topDestinations}
            </h3>
            {exportMode && <p className="text-xs text-gray-500 mt-1">{getPeriodString(filterDates)}</p>}
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.byCountry} layout="vertical" margin={{ top: 5, right: exportMode ? 80 : 30, left: 40, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11}} />
              <RechartsTooltip content={<CustomTooltip lang={lang} />} cursor={{fill: 'transparent'}} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20} fill="#EF4444">
                {exportMode && <LabelList dataKey="value" position="right" formatter={formatShortCurrency} style={{ fontSize: '11px', fontWeight: 'bold', fill: '#333' }} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card id="chart-projects" title={t.topProjects} lang={lang}>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Briefcase size={18} className="text-indigo-500" />
              {t.topProjects}
            </h3>
            {exportMode && <p className="text-xs text-gray-500 mt-1">{getPeriodString(filterDates)}</p>}
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.byProject} layout="vertical" margin={{ top: 5, right: exportMode ? 80 : 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={140} tick={{fontSize: 11}} />
              <RechartsTooltip content={<CustomTooltip lang={lang} />} cursor={{fill: 'transparent'}} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20} fill="#8B5CF6">
                {exportMode && <LabelList dataKey="value" position="right" formatter={formatShortCurrency} style={{ fontSize: '11px', fontWeight: 'bold', fill: '#333' }} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};
