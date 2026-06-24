import React from 'react';
import { Heart, Globe, CalendarRange, RefreshCcw, Eye, Sparkles, Upload, ImageIcon } from 'lucide-react';

import { Language, DateRange, DateBounds, TranslationSet } from '../types';

interface HeaderProps {
  lang: Language;
  setLang: (lang: Language) => void;
  filterDates: DateRange;
  setFilterDates: (dates: DateRange) => void;
  dataBounds: DateBounds;
  exportMode: boolean;
  setExportMode: (mode: boolean) => void;
  onOpenAI: () => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileName: string | null;
  resetFilters: () => void;
  t: TranslationSet;
}

export const Header: React.FC<HeaderProps> = ({
  lang, setLang, filterDates, setFilterDates, dataBounds,
  exportMode, setExportMode, onOpenAI, onFileUpload, fileName, resetFilters, t,
}) => {
  return (
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
              onClick={onOpenAI}
              className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-3 py-1.5 rounded-lg transition-all shadow-sm hover:shadow-md border border-transparent"
            >
              <Sparkles size={14} className="text-yellow-300" />
              <span className="text-sm font-bold hidden lg:inline">{t.aiAssistant}</span>
              <span className="text-sm font-bold lg:hidden">AI</span>
            </button>

            <label className={`flex items-center gap-2 cursor-pointer bg-white hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg transition-colors border border-gray-300 shadow-sm`}>
              <Upload size={14} />
              <span className="text-sm font-medium hidden sm:inline">{fileName ? t.change : t.import}</span>
              <input type="file" accept=".csv" onChange={onFileUpload} className="hidden" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
