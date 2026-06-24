import { DonationRecord, ChartData, DashboardStats } from "../types";

export const parseDate = (dateStr: string): Date => {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split('/');
  if (parts.length !== 3) return new Date(0);
  let [day, month, year] = parts;
  if (year.length === 2) year = '20' + year;
  return new Date(`${year}-${month}-${day}`);
};

export const formatDateForInput = (date: Date): string => {
  if (!date || isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
};

export const sumBy = (arr: any[], keyFn: (item: any) => number): number => 
  arr.reduce((acc, item) => acc + (keyFn(item) || 0), 0);

export const groupBy = (arr: any[], key: string): Record<string, any[]> => {
  return arr.reduce((acc, item) => {
    const groupKey = item[key] || 'Non spécifié';
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(item);
    return acc;
  }, {});
};

export const calculateStats = (data: DonationRecord[]): DashboardStats => {
  const totalAmount = sumBy(data, (d) => parseFloat(d.Amount || '0'));
  const totalDonations = data.length;
  const avgDonation = totalDonations > 0 ? totalAmount / totalDonations : 0;

  // By Theme
  const themeGroups = groupBy(data, 'Thème');
  const byTheme: ChartData[] = Object.entries(themeGroups)
    .map(([key, objs]) => ({ name: key, value: sumBy(objs, d => parseFloat(d.Amount || '0')), count: objs.length }))
    .sort((a, b) => b.value - a.value);

  // By Type
  const typeGroups = groupBy(data, 'Requête');
  const byType: ChartData[] = Object.entries(typeGroups)
    .map(([key, objs]) => ({ name: key, value: sumBy(objs, d => parseFloat(d.Amount || '0')), count: objs.length }))
    .sort((a, b) => b.value - a.value);

  // By Project
  const projectGroups = groupBy(data, 'Allocation Summary');
  const byProject: ChartData[] = Object.entries(projectGroups)
    .map(([key, objs]) => ({ name: key, value: sumBy(objs, d => parseFloat(d.Amount || '0')), count: objs.length }))
    .sort((a, b) => b.value - a.value).slice(0, 10);

  // By Income Type
  const incomeGroups = groupBy(data, 'Income Type');
  const byIncomeType: ChartData[] = Object.entries(incomeGroups)
    .map(([key, objs]) => ({ name: key || 'Inconnu', value: sumBy(objs, d => parseFloat(d.Amount || '0')), count: objs.length }))
    .sort((a, b) => b.value - a.value);

  // By Country
  const countryGroups = groupBy(data, 'Localité');
  const byCountry: ChartData[] = Object.entries(countryGroups)
    .map(([key, objs]) => ({ name: key === 'undefined' ? 'Global' : key, value: sumBy(objs, d => parseFloat(d.Amount || '0')), count: objs.length }))
    .sort((a, b) => b.value - a.value).slice(0, 10);

  // By Region
  const regionGroups = groupBy(data, 'Account Postal Region');
  const byRegion: ChartData[] = Object.entries(regionGroups)
    .map(([key, objs]) => ({ name: key || 'Inconnu', value: sumBy(objs, d => parseFloat(d.Amount || '0')), count: objs.length }))
    .sort((a, b) => b.value - a.value).slice(0, 10);

  // By Date (Monthly aggregation for general view, could be refined)
  const dateGroups = groupBy(data, 'Donation Date');
  const byDate = Object.entries(dateGroups)
    .map(([key, objs]) => {
      const d = parseDate(key);
      return { 
        date: d.toISOString(), 
        label: key,
        amount: sumBy(objs, d => parseFloat(d.Amount || '0')), 
        count: objs.length 
      }
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return { totalAmount, totalDonations, avgDonation, byTheme, byType, byProject, byIncomeType, byCountry, byRegion, byDate };
};