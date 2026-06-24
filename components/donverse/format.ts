// Shared FR formatters + Muslim Hands green theme for DONVERSE

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});
const eur2 = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 2,
});
const num = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export const fmtEur = (v: number) => eur.format(v || 0);
export const fmtEur2 = (v: number) => eur2.format(v || 0);
export const fmtNum = (v: number) => num.format(v || 0);
export const fmtPct = (v: number) => `${(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

// Compact currency for axis labels (e.g. 1,2 M€ / 350 k€)
export const fmtEurShort = (v: number) => {
  const n = v || 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000).toLocaleString('fr-FR')} k€`;
  return `${Math.round(n)} €`;
};

// Muslim Hands green palette
export const MH = {
  green: '#107c10',
  greenDark: '#0b5a0b',
  greenMid: '#2f9e44',
  greenLight: '#69db7c',
  emerald: '#10b981',
};

// Categorical palette (green-led, with supporting hues for pies)
export const PALETTE = [
  '#107c10', '#2f9e44', '#40c057', '#69db7c', '#0ca678',
  '#1098ad', '#4263eb', '#7048e8', '#e8590c', '#f08c00',
  '#c2255c', '#868e96',
];
