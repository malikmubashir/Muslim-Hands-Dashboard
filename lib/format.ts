import { Language, DateRange } from '../types';

export const createFormatters = (lang: Language) => {
  const formatCurrency = (val: number) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR', { style: 'currency', currency: 'EUR' }).format(val);
  const formatShortCurrency = (val: number) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR', { style: 'currency', currency: 'EUR', maximumSignificantDigits: 3 }).format(val);
  return { formatCurrency, formatShortCurrency };
};

export const getPeriodString = (filterDates: DateRange) => {
  if (!filterDates.start || !filterDates.end) return 'Global';
  return `${filterDates.start} - ${filterDates.end}`;
};
