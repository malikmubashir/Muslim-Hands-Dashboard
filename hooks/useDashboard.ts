import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';

import { DonationRecord, DateRange, DateBounds } from '../types';
import { SAMPLE_DATA } from '../constants';
import { parseDate, formatDateForInput, calculateStats, sumBy, groupBy } from '../services/dataService';

export const useDashboard = () => {
  const [data, setData] = useState<DonationRecord[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDeepDiveTheme, setSelectedDeepDiveTheme] = useState('Orphelins');
  const [filterDates, setFilterDates] = useState<DateRange>({ start: '', end: '' });
  const [dataBounds, setDataBounds] = useState<DateBounds>({ min: '', max: '' });

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
  };
};
