import React, { useState } from 'react';
import { Upload } from 'lucide-react';

import { Language } from './types';
import { TRANSLATIONS } from './constants';
import { AIAssistant } from './components/AIAssistant';
import { Header } from './components/Header';
import { KpiRow } from './components/KpiRow';
import { DeepDive } from './components/DeepDive';
import { OverviewCharts } from './components/OverviewCharts';
import { GeoProjectCharts } from './components/GeoProjectCharts';
import { useDashboard } from './hooks/useDashboard';
import { createFormatters } from './lib/format';

const App: React.FC = () => {
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [exportMode, setExportMode] = useState(false);
  const [lang, setLang] = useState<Language>('fr');
  const t = TRANSLATIONS[lang];

  const {
    fileName, loading, filterDates, setFilterDates, dataBounds,
    stats, deepDiveStats, selectedDeepDiveTheme, setSelectedDeepDiveTheme,
    handleFileUpload, resetFilters,
  } = useDashboard();

  const formatters = createFormatters(lang);
  const { formatCurrency } = formatters;

  return (
    <div className={`min-h-screen bg-gray-50 font-sans text-slate-800 ${lang === 'ur' ? 'font-urdu' : ''}`} dir={lang === 'ur' ? 'rtl' : 'ltr'}>
      <Header
        lang={lang}
        setLang={setLang}
        filterDates={filterDates}
        setFilterDates={setFilterDates}
        dataBounds={dataBounds}
        exportMode={exportMode}
        setExportMode={setExportMode}
        onOpenAI={() => setIsAIModalOpen(true)}
        onFileUpload={handleFileUpload}
        fileName={fileName}
        resetFilters={resetFilters}
        t={t}
      />

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

            <KpiRow stats={stats} t={t} formatCurrency={formatCurrency} />

            <DeepDive
              stats={stats}
              deepDiveStats={deepDiveStats}
              selectedDeepDiveTheme={selectedDeepDiveTheme}
              setSelectedDeepDiveTheme={setSelectedDeepDiveTheme}
              exportMode={exportMode}
              lang={lang}
              t={t}
              formatters={formatters}
              filterDates={filterDates}
            />

            <OverviewCharts
              stats={stats}
              exportMode={exportMode}
              lang={lang}
              t={t}
              formatters={formatters}
              filterDates={filterDates}
            />

            <GeoProjectCharts
              stats={stats}
              exportMode={exportMode}
              lang={lang}
              t={t}
              formatters={formatters}
              filterDates={filterDates}
            />

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
