import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';

import { DonationRecord, DateRange, DateBounds } from '../types';
import { SAMPLE_DATA } from '../constants';
import { parseDate, formatDateForInput, calculateStats, sumBy, groupBy } from '../services/dataService';
import {
  AggregatesFile,
  loadAggregates,
  statsFromAggregates,
  deepDiveFromAggregates,
  boundsFromMeta,
  monthRange,
} from '../services/aggregatesService';

// Two data modes:
//  - 'aggregates' (DEFAULT): fetches the small pre-aggregated JSON. Date
//    filtering is MONTH-granular in this mode (the JSON is keyed by YYYY-MM).
//  - 'raw': activated when the user uploads a CSV. Falls back to the original
//    day-level raw rows + calculateStats + day-level deep-dive logic.
type DataMode = 'aggregates' | 'raw';

export const useDashboard = () => {
  const [mode, setMode] = useState<DataMode>('aggregates');
  const [aggregates, setAggregates] = useState<AggregatesFile | null>(null);

  const [data, setData] = useState<DonationRecord[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDeepDiveTheme, setSelectedDeepDiveTheme] = useState('Orphelins');
  const [filterDates, setFilterDates] = useState<DateRange>({ start: '', end: '' });
  const [dataBounds, setDataBounds] = useState<DateBounds>({ min: '', max: '' });

  // Load aggregates on mount (DEFAULT source). On failure, fall back to
  // SAMPLE_DATA so the app never blank-screens.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadAggregates()
      .then((agg) => {
        if (cancelled) return;
        setAggregates(agg);
        setMode('aggregates');
        const bounds = boundsFromMeta(agg.meta);
        setDataBounds(bounds);
        setFilterDates({ start: bounds.min, end: bounds.max });
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load aggregates, falling back to SAMPLE_DATA:', err);
        if (cancelled) return;
        setMode('raw');
        setData(SAMPLE_DATA);
        calculateDateBounds(SAMPLE_DATA);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const calculateDateBounds = (dataset: DonationRecord[]) => {
    if (!dataset || dataset.length === 0) return;
    const dates = dataset.map(d => parseDate(d['Donation Date'])).filter(d => !isNaN(d.getTime()));
    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      const minStr = formatDateForInput(minDate);
      const maxStr = formatDateForInput(maxDate);
      const bounds = { min: minStr, max: maxStr };
      setDataBounds(bounds);
      setFilterDates({ start: minStr, end: maxStr });
    }
  };

  // CSV upload switches to 'raw' mode: day-level raw rows, original logic.
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLoading(true);
      setFileName(file.name);
      Papa.parse<DonationRecord>(file, {
        header: true,
        complete: (results) => {
          const cleanData = results.data.filter((row: any) => row['Donation Reference'] || row['Amount']);
          setMode('raw');
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

  // ---- RAW mode: day-level filtering (original behavior) -------------------
  const filteredData = useMemo(() => {
    if (mode !== 'raw') return [];
    if (!data.length) return [];
    if (!filterDates.start || !filterDates.end) return data;
    const start = new Date(filterDates.start);
    const end = new Date(filterDates.end);
    end.setHours(23, 59, 59, 999);
    return data.filter(item => {
      const itemDate = parseDate(item['Donation Date']);
      return itemDate >= start && itemDate <= end;
    });
  }, [mode, data, filterDates]);

  // ---- stats (mode-aware) -------------------------------------------------
  const stats = useMemo(() => {
    if (mode === 'aggregates') {
      if (!aggregates) return null;
      // MONTH-granular date filtering in aggregates mode.
      return statsFromAggregates(aggregates, monthRange(filterDates));
    }
    if (!filteredData.length) return null;
    return calculateStats(filteredData);
  }, [mode, aggregates, filterDates, filteredData]);

  // ---- deep dive (mode-aware) ---------------------------------------------
  const deepDiveStats = useMemo(() => {
    if (!selectedDeepDiveTheme) return null;

    if (mode === 'aggregates') {
      if (!aggregates) return null;
      // MONTH-granular date filtering in aggregates mode.
      return deepDiveFromAggregates(aggregates, selectedDeepDiveTheme, monthRange(filterDates));
    }

    // RAW mode: original day-level deep-dive logic.
    if (!filteredData.length) return null;
    const currentThemeData = filteredData.filter(d => d['Thème'] === selectedDeepDiveTheme);
    const totalDeepDiveAmount = sumBy(currentThemeData, d => parseFloat(d.Amount || '0'));
    const totalDeepDiveCount = currentThemeData.length;

    const subTypeGroups = groupBy(currentThemeData, 'Allocation Summary');
    const bySubType = Object.entries(subTypeGroups)
      .map(([key, objs]) => ({ name: key || 'Non spécifié', value: sumBy(objs, d => parseFloat(d.Amount || '0')), count: objs.length }))
      .sort((a, b) => b.value - a.value);

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
  }, [mode, aggregates, filterDates, filteredData, selectedDeepDiveTheme]);

  return {
    data,
    fileName,
    loading,
    filterDates,
    setFilterDates,
    dataBounds,
    filteredData,
    stats,
    deepDiveStats,
    selectedDeepDiveTheme,
    setSelectedDeepDiveTheme,
    handleFileUpload,
    resetFilters,
    calculateDateBounds,
    mode,
  };
};
