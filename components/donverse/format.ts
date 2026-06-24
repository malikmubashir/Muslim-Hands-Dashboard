// Shared FR formatters + Muslim Hands France turquoise theme for DONVERSE

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

// Muslim Hands France turquoise palette (keys kept for backwards compat)
export const MH = {
  green: '#28B8D8',      // brand 500 — primary bar/area fill
  greenDark: '#1C8099',  // brand 700 — emphasis
  greenMid: '#45C9DF',   // brand 400 — secondary
  greenLight: '#9FE7F1', // brand 200 — light tint
  emerald: '#28B8D8',    // brand 500
};

// Categorical palette (turquoise-led, with supporting hues for pies)
export const PALETTE = [
  '#28B8D8', '#1C8099', '#6FD9E9', '#1B6878', '#9FE7F1',
  '#1098ad', '#4263eb', '#7048e8', '#e8590c', '#f08c00',
  '#c2255c', '#868e96',
];
