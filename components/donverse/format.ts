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

// Categorical palette — turquoise-led, then 11 distinct attractive hues.
// Applied per-Cell so each bar/slice gets a different color.
export const PALETTE = [
  '#28B8D8', // brand turquoise
  '#F59E0B', // amber
  '#EF4444', // coral
  '#8B5CF6', // violet
  '#10B981', // green
  '#3B82F6', // blue
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#6366F1', // indigo
  '#84CC16', // lime
  '#06B6D4', // cyan
];

// Stable color for a category index.
export const paletteAt = (i: number) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];

// Month label helper, e.g. "2024-12" -> "déc. 2024".
const MONTH_NAMES = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const fmtMonth = (m: string) => {
  const [y, mm] = (m || '').split('-');
  const idx = parseInt(mm, 10) - 1;
  if (!y || isNaN(idx)) return m || '';
  return `${MONTH_NAMES[idx]} ${y}`;
};
// Short month label for axes, e.g. "déc. 24".
export const fmtMonthShort = (m: string) => {
  const [y, mm] = (m || '').split('-');
  const idx = parseInt(mm, 10) - 1;
  if (!y || isNaN(idx)) return m || '';
  return `${MONTH_NAMES[idx]} ${y.slice(2)}`;
};
