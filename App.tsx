import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  Heart, Globe, CalendarRange, RefreshCcw, Eye, Sparkles, Upload, 
  DollarSign, Activity, Users, Filter, Layers, TrendingUp, Droplets, 
  BarChart2, MapPin, Briefcase, ImageIcon
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer, Cell, AreaChart, Area, FunnelChart, Funnel, LabelList, PieChart, Pie
} from 'recharts';

import { DonationRecord, Language, DateRange, DateBounds } from './types';
import { TRANSLATIONS, SAMPLE_DATA, COLORS, THEME_COLORS } from './constants';
import { parseDate, formatDateForInput, calculateStats, sumBy, groupBy } from './services/dataService';
import { Card } from './components/ui/Card';
import { AIAssistant } from './components/AIAssistant';

// --- SUB COMPONENTS (Defined here to avoid file sprawl in this specific task) ---

const StatCard = ({ title, value, subtext, icon: Icon, color }: any) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <h3 className="text-2xl font-bold mt-2 text-gray-800">{value}</h3>
        {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
      </div>
      <div className={`p-3 rounded-full ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
    </div>
  </div>
);

const CustomTooltip = ({ active, payload, label, lang }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const name = data.name || data.label || label;
    const value = data.value !== undefined ? data.value : data.amount;
    const count = data.count;

    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    let amountLabel = 'Montant:';
    let countLabel = 'Nombre:';
    
    if (lang === 'en') {
      amountLabel = 'Amount:';
      countLabel = 'Count:';
    } else if (lang === 'ur') {
      amountLabel = 'رقم:';
      countLabel = 'تعداد:';
    }

    return (
      <div className="bg-white p-3 border border-gray-200 shadow-xl rounded-lg z-50">
        <p className={`font-bold text-gray-800 mb-2 border-b border-gray-100 pb-1 ${lang === 'ur' ? 'font-urdu text-right' : ''}`}>{name}</p>
        <div className="space-y-1">
          <p className="text-sm text-green-700 font-semibold flex justify-between gap-4">
            <span className={lang === 'ur' ? 'font-urdu' : ''}>{amountLabel}</span>
            <span>{new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value)}</span>
          </p>
          {count !== undefined && (
            <p className="text-sm text-gray-600 flex justify-between gap-4">
              <span className={lang === 'ur' ? 'font-urdu' : ''}>{countLabel}</span>
              <span className="font-medium">{count}</span>
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

// --- MAIN APP ---

const App: React.FC = () => {
  const [data, setData] = useState<DonationRecord[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [selectedDeepDiveTheme, setSelectedDeepDiveTheme] = useState('Orphelins');
  const [themeViewMode, setThemeViewMode] = useState<'funnel' | 'bar'>('funnel');
  const [filterDates, setFilterDates] = useState<DateRange>({ start: '', end: '' });
  const [dataBounds, setDataBounds] = useState<DateBounds>({ min: '', max: '' });
  const [exportMode, setExportMode] = useState(false);
  
  const [lang, setLang] = useState<Language>('fr');
  const t = TRANSLATIONS[lang];

  // Load sample data on mount
  useEffect(() => {
    setData(SAMPLE_DATA);
    calculateDateBounds(SAMPLE_DATA);
  }, []);

  const calculateDateBounds = (dataset: DonationRecord[]) => {
    if (!dataset || dataset.length === 0) return;
    const dates = dataset.map(d => parseDate(d['Donation Date'])).filter(d => !isNaN(d.getTime()));
    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      const minStr = formatDateForInput(minDate);
      const maxStr = formatDateForInput(maxDate);
      // Extend bounds to undefined here? No, just keep as strings
      const bounds = { min: minStr, max: maxStr };
      setDataBounds(bounds); 
      setFilterDates({ start: minStr, end: maxStr });
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLoading(true);
      setFileName(file.name);
      Papa.parse<DonationRecord>(file, {
        header: true,
        complete: (results) => {
          const cleanData = results.data.filter((row: any) => row['Donation Reference'] || row['Amount']);
          setData(cleanData);
          calculateDateBounds(cleanData);
          setLoading(false);
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
          setLoading(false);
        }
      });
    }
  };

  const resetFilters = () => {
    setFilterDates({ start: dataBounds.min, end: dataBounds.max });
  };

  const filteredData = useMemo(() => {
    if (!data.length) return [];
    if (!filterDates.start || !filterDates.end) return data;
    const start = new Date(filterDates.start);
    const end = new Date(filterDates.end);
    end.setHours(23, 59, 59, 999);
    return data.filter(item => {
      const itemDate = parseDate(item['Donation Date']);
      return itemDate >= start && itemDate <= end;
    });
  }, [data, filterDates]);

  const stats = useMemo(() => {
    if (!filteredData.length) return null;
    return calculateStats(filteredData);
  }, [filteredData]);

  // Specific Deep Dive Logic
  const deepDiveStats = useMemo(() => {
    if (!filteredData.length || !selectedDeepDiveTheme) return null;
    const currentThemeData = filteredData.filter(d => d['Thème'] === selectedDeepDiveTheme);
    const totalDeepDiveAmount = sumBy(currentThemeData, d => parseFloat(d.Amount || '0'));
    const totalDeepDiveCount = currentThemeData.length;

    const subTypeGroups = groupBy(currentThemeData, 'Allocation Summary');
    const bySubType = Object.entries(subTypeGroups)
      .map(([key, objs]) => ({ name: key || 'Non spécifié', value: sumBy(objs, d => parseFloat(d.Amount || '0')), count: objs.length }))
      .sort((a, b) => b.value - a.value);

    // Monthly aggregation
    const monthlyGroups = currentThemeData.reduce((acc: any, item: DonationRecord) => {
      const dateStr = item['Donation Date'];
      if (!dateStr) return acc;
      const dateObj = parseDate(dateStr);
      if (isNaN(dateObj.getTime())) return acc;
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;
      const displayLabel = `${month}/${year}`;
      if (!acc[key]) acc[key] = { date: key, label: displayLabel, amount: 0, count: 0 };
      acc[key].amount += parseFloat(item.Amount || '0');
      acc[key].count += 1;
      return acc;
    }, {});

    const trendByMonth = Object.values(monthlyGroups).sort((a: any, b: any) => a.date.localeCompare(b.date));
    return { bySubType, trendByMonth, totalDeepDiveAmount, totalDeepDiveCount };
  }, [filteredData, selectedDeepDiveTheme]);

  const formatCurrency = (val: number) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR', { style: 'currency', currency: 'EUR' }).format(val);
  const formatShortCurrency = (val: number) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR', { style: 'currency', currency: 'EUR', maximumSignificantDigits: 3 }).format(val);

  const getPeriodString = () => {
    if (!filterDates.start || !filterDates.end) return 'Global';
    return `${filterDates.start} - ${filterDates.end}`;
  };

  return (
    <div className={`min-h-screen bg-gray-50 font-sans text-slate-800 ${lang === 'ur' ? 'font-urdu' : ''}`} dir={lang === 'ur' ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center h-auto md:h-16 py-3 md:py-0 gap-3">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="bg-green-600 p-2 rounded-lg shrink-0 shadow-sm">
                <Heart className="text-white h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 hidden sm:block">{t.title} <span className="font-normal text-gray-500 text-sm">| {t.subtitle}</span></h1>
                <h1 className="text-xl font-bold text-gray-900 sm:hidden">{t.title}</h1>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
              {/* Language Switcher */}
              <div className="relative group z-30">
                <button className="flex items-center gap-1 bg-gray-50 p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-sm font-medium">
                  <Globe size={16} />
                  <span className="uppercase">{lang}</span>
                </button>
                <div className="absolute top-full right-0 mt-1 w-32 bg-white border border-gray-100 rounded-lg shadow-lg hidden group-hover:block">
                  <button onClick={() => setLang('fr')} className="block w-full text-left px-4 py-2 hover:bg-gray-50 text-sm text-gray-700">Français</button>
                  <button onClick={() => setLang('en')} className="block w-full text-left px-4 py-2 hover:bg-gray-50 text-sm text-gray-700">English</button>
                  <button onClick={() => setLang('ur')} className="block w-full text-right px-4 py-2 hover:bg-gray-50 text-sm font-urdu text-gray-700">اردو</button>
                </div>
              </div>

              {/* Date Filters */}
              <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                 <div className="flex items-center gap-1 text-gray-500 px-2 border-r border-gray-200">
                    <CalendarRange size={14} />
                    <span className="text-xs font-semibold uppercase hidden lg:inline">{t.period}</span>
                 </div>
                 <input 
                    type="date" 
                    value={filterDates.start} 
                    min={dataBounds.min}
                    max={filterDates.end || dataBounds.max}
                    onChange={(e) => setFilterDates({...filterDates, start: e.target.value})}
                    className="bg-transparent border-none text-xs font-medium text-gray-700 focus:ring-0 cursor-pointer p-0 w-24 outline-none"
                 />
                 <span className="text-gray-400">-</span>
                 <input 
                    type="date" 
                    value={filterDates.end} 
                    min={filterDates.start || dataBounds.min}
                    max={dataBounds.max}
                    onChange={(e) => setFilterDates({...filterDates, end: e.target.value})}
                    className="bg-transparent border-none text-xs font-medium text-gray-700 focus:ring-0 cursor-pointer p-0 w-24 outline-none"
                 />
                 <button 
                    onClick={resetFilters} 
                    className="ml-1 p-1 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                    title={t.reset}
                  >
                    <RefreshCcw size={12} />
                 </button>
              </div>

              {/* Export Mode Toggle */}
              <button 
                onClick={() => setExportMode(!exportMode)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all border ${exportMode ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                title={t.reportMode}
              >
                {exportMode ? <ImageIcon size={14} /> : <Eye size={14} />}
                <span className="text-sm font-medium hidden lg:inline">{exportMode ? t.reportMode : t.reportMode}</span>
              </button>

              <div className="h-6 w-px bg-gray-200 mx-1 hidden md:block"></div>

              <button 
                onClick={() => setIsAIModalOpen(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-3 py-1.5 rounded-lg transition-all shadow-sm hover:shadow-md border border-transparent"
              >
                <Sparkles size={14} className="text-yellow-300" />
                <span className="text-sm font-bold hidden lg:inline">{t.aiAssistant}</span>
                <span className="text-sm font-bold lg:hidden">AI</span>
              </button>
              
              <label className={`flex items-center gap-2 cursor-pointer bg-white hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg transition-colors border border-gray-300 shadow-sm`}>
                <Upload size={14} />
                <span className="text-sm font-medium hidden sm:inline">{fileName ? t.change : t.import}</span>
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          </div>
        ) : !stats ? (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="bg-green-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
               <Upload className="text-green-600" size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">{t.noData}</h3>
            <p className="text-gray-500 mt-2">{t.noDataSub}</p>
            <button onClick={resetFilters} className="mt-4 text-green-600 font-medium hover:underline">{t.reset}</button>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* KPI Row */}
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

            {/* DEEP DIVE SECTION */}
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
                          {exportMode && <p className="text-xs text-gray-500 mt-1">{getPeriodString()}</p>}
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
                          {exportMode && <p className="text-xs text-gray-500 mt-1">{getPeriodString()}</p>}
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

            {/* General Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6 border-t border-gray-200">
              <Card className="lg:col-span-2" id="chart-global" title={t.globalView} lang={lang}>
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      {themeViewMode === 'funnel' ? <Filter size={18} className="text-blue-500" /> : <Droplets size={18} className="text-blue-500" />}
                      {t.globalView} {themeViewMode === 'funnel' ? `(${t.funnel})` : `(${t.bars})`}
                    </h3>
                    {exportMode && <p className="text-xs text-gray-500 mt-1">{getPeriodString()}</p>}
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
                    {exportMode && <p className="text-xs text-gray-500 mt-1">{getPeriodString()}</p>}
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
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               <Card id="chart-geo" title={t.topDestinations} lang={lang}>
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <MapPin size={18} className="text-red-500" />
                      {t.topDestinations}
                    </h3>
                    {exportMode && <p className="text-xs text-gray-500 mt-1">{getPeriodString()}</p>}
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
                    {exportMode && <p className="text-xs text-gray-500 mt-1">{getPeriodString()}</p>}
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

          </div>
        )}
      </main>

      {stats && (
        <AIAssistant isOpen={isAIModalOpen} onClose={() => setIsAIModalOpen(false)} stats={stats} lang={lang} />
      )}
    </div>
  );
};

export default App;