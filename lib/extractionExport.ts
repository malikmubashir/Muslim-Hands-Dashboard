// lib/extractionExport.ts
//
// Shared, in-browser donor extraction + formatted Excel (.xlsx) export. Used by
// the dashboard views (Overview, ThemeDetail, Carte de France) to download the
// donors behind whatever slice the user is looking at — date-range aware, on
// the spot.
//
// NOTHING is uploaded: filtering + workbook building happen entirely in the
// browser against the already-decrypted in-memory extraction records. No
// plaintext-PII network calls.
import * as XLSX from 'xlsx-js-style';
import type { ExtractionRecord } from './buildExtractionData';

// ---- Generosity tiers (labels/thresholds MUST match lib/aggregateDonverse.ts) ----
export const TIER_ORDER = ['Kind (<500)', 'Engaged (500-1.5k)', 'Generous (1.5-5k)', 'Major (≥5k)'];
export function tierName(total: number): string {
  if (total >= 5000) return 'Major (≥5k)';
  if (total >= 1500) return 'Generous (1.5-5k)';
  if (total >= 500) return 'Engaged (500-1.5k)';
  return 'Kind (<500)';
}

// ---- Slice descriptor: a subset of gift/donor criteria, AND-combined. ----
export interface ExtractionFilters {
  stip: string[];       // stipulation
  dest: string[];       // destination (Fund Dim 1)
  cause: string[];      // cause / thème (Fund Dim 2)
  pay: string[];        // payment method
  amountMin: string;    // per-gift montant min
  amountMax: string;    // per-gift montant max
  dateFrom: string;     // gift date >= (YYYY-MM-DD)
  dateTo: string;       // gift date <= (YYYY-MM-DD)
  activite: string[];
  palier: string[];
  genre: string[];
  type: string[];
  post: Tri;
  tel: Tri;
  email: Tri;
  pcat: string[];       // raw RGPD POST category (Donateurs consent segments)
  region: string;       // exact tx-location region, '' = any (map)
  dept: string;         // exact tx-location dept, '' = any (map)
  dregion: string;      // exact donor HOME region, '' = any (Donateurs)
  ddept: string;        // exact donor HOME dept, '' = any (Donateurs)
  city: string;         // contains
}
export type Tri = 'tous' | 'IN' | 'OUT';

export const EMPTY_FILTERS: ExtractionFilters = {
  stip: [], dest: [], cause: [], pay: [],
  amountMin: '', amountMax: '', dateFrom: '', dateTo: '',
  activite: [], palier: [], genre: [], type: [],
  post: 'tous', tel: 'tous', email: 'tous', pcat: [],
  region: '', dept: '', dregion: '', ddept: '', city: '',
};

// Gift-level predicate. AND-combines transaction + donor criteria. A donor is
// kept if at least one of their gifts satisfies this (handled by filtering the
// gift array, then deduping).
export function matchesGift(r: ExtractionRecord, f: ExtractionFilters): boolean {
  if (f.stip.length && !f.stip.includes(r.stip)) return false;
  if (f.dest.length && !f.dest.includes(r.dest)) return false;
  if (f.cause.length && !f.cause.includes(r.cause)) return false;
  if (f.pay.length && !f.pay.includes(r.pay)) return false;
  const min = f.amountMin === '' ? null : parseFloat(f.amountMin);
  const max = f.amountMax === '' ? null : parseFloat(f.amountMax);
  if (min != null && !isNaN(min) && r.amt < min) return false;
  if (max != null && !isNaN(max) && r.amt > max) return false;
  if (f.dateFrom && (!r.dt || r.dt < f.dateFrom)) return false;
  if (f.dateTo && (!r.dt || r.dt > f.dateTo)) return false;
  if (f.activite.length && !f.activite.includes(r.act)) return false;
  if (f.palier.length && !f.palier.includes(r.tier)) return false;
  if (f.genre.length && !f.genre.includes(r.genre)) return false;
  if (f.type.length && !f.type.includes(r.type)) return false;
  if (f.post !== 'tous' && r.rPost !== f.post) return false;
  if (f.tel !== 'tous' && r.rTel !== f.tel) return false;
  if (f.email !== 'tous' && r.rEmail !== f.email) return false;
  if (f.pcat.length && !f.pcat.includes(r.pcat)) return false;
  if (f.region && r.reg !== f.region) return false;
  if (f.dept && r.dept !== f.dept) return false;
  if (f.dregion && r.dreg !== f.dregion) return false;
  if (f.ddept && r.ddept !== f.ddept) return false;
  if (f.city && !r.city.toLowerCase().includes(f.city.toLowerCase())) return false;
  return true;
}

// ---- Distinct donor (deduped by ref), aggregated within the current slice ----
export interface Donor {
  ref: string;
  civ: string; fn: string; ln: string; nm: string;
  email: string; phone: string;
  addr: string; pc: string; city: string; dept: string; region: string; ctry: string;
  ltv: number;            // total donated, all periods
  selAmount: number;      // montant within the current slice
  selCount: number;       // nb gifts within the current slice
  causes: string[]; stips: string[]; dests: string[];
  rPost: 'IN' | 'OUT'; rTel: 'IN' | 'OUT'; rEmail: 'IN' | 'OUT';
  act: string; tier: string; genre: string; type: string;
}

// Dedupe matching gift records into distinct donors. Records without a ref are
// kept as their own one-off donors (synthetic key) so tx-only rows aren't merged.
export function dedupeDonors(rows: ExtractionRecord[]): Donor[] {
  const byRef = new Map<string, Donor>();
  let anon = 0;
  for (const r of rows) {
    const key = r.ref || `__noref_${anon++}`;
    let d = byRef.get(key);
    if (!d) {
      d = {
        ref: r.ref,
        civ: r.civ, fn: r.fn, ln: r.ln,
        nm: r.nm || `${r.fn} ${r.ln}`.trim(),
        email: r.email, phone: r.phone,
        addr: r.addr, pc: r.dpc || r.pc, city: r.loc || r.city,
        dept: r.ddept || r.dept, region: r.dreg || r.reg, ctry: r.ctry,
        ltv: r.ltv, selAmount: 0, selCount: 0,
        causes: [], stips: [], dests: [],
        rPost: r.rPost, rTel: r.rTel, rEmail: r.rEmail,
        act: r.act, tier: r.tier, genre: r.genre, type: r.type,
      };
      byRef.set(key, d);
    }
    d.selAmount += r.amt;
    d.selCount += 1;
    if (r.cause && !d.causes.includes(r.cause)) d.causes.push(r.cause);
    if (r.stip && !d.stips.includes(r.stip)) d.stips.push(r.stip);
    if (r.dest && !d.dests.includes(r.dest)) d.dests.push(r.dest);
    if (r.ltv > d.ltv) d.ltv = r.ltv;
  }
  return [...byRef.values()].sort((a, b) => b.selAmount - a.selAmount);
}

// ---- Formatted Excel (.xlsx) workbook ----
// Column order, headers, widths (chars) and which columns are numeric.
const COLS: { header: string; width: number; kind?: 'eur' | 'int' }[] = [
  { header: 'Référence', width: 12 },
  { header: 'Civilité', width: 9 },
  { header: 'Prénom', width: 16 },
  { header: 'Nom', width: 18 },
  { header: 'Nom complet', width: 24 },
  { header: 'Email', width: 30 },
  { header: 'Téléphone', width: 16 },
  { header: 'Adresse', width: 36 },
  { header: 'Code postal', width: 11 },
  { header: 'Ville', width: 18 },
  { header: 'Département', width: 11 },
  { header: 'Région', width: 22 },
  { header: 'Pays', width: 10 },
  { header: 'Total donné (toutes périodes)', width: 16, kind: 'eur' },
  { header: 'Montant dans la sélection', width: 16, kind: 'eur' },
  { header: 'Nb dons (sélection)', width: 12, kind: 'int' },
  { header: 'Causes (sélection)', width: 28 },
  { header: 'Stipulations (sélection)', width: 26 },
  { header: 'RGPD Post', width: 10 },
  { header: 'RGPD Téléphone', width: 13 },
  { header: 'RGPD Email', width: 11 },
  { header: 'Activité', width: 16 },
  { header: 'Palier', width: 14 },
  { header: 'Genre', width: 13 },
  { header: 'Type', width: 13 },
];

function donorRow(d: Donor): (string | number)[] {
  return [
    d.ref, d.civ, d.fn, d.ln, d.nm, d.email, d.phone, d.addr, d.pc, d.city,
    d.dept, d.region, d.ctry,
    d.ltv,
    Math.round((d.selAmount + Number.EPSILON) * 100) / 100,
    d.selCount,
    d.causes.join(' | '), d.stips.join(' | '),
    d.rPost, d.rTel, d.rEmail, d.act, d.tier, d.genre, d.type,
  ];
}

const MH_TURQ = '28B8D8';
const MH_DARK = '1C8099';
const thinBorder = (rgb: string) => {
  const s = { style: 'thin', color: { rgb } } as const;
  return { top: s, bottom: s, left: s, right: s };
};
function setCell(ws: XLSX.WorkSheet, r: number, c: number, style: any) {
  const addr = XLSX.utils.encode_cell({ r, c });
  if (!ws[addr]) ws[addr] = { t: 's', v: '' };
  const cell = ws[addr] as any;
  cell.s = { ...(cell.s || {}), ...style };
}

// Build a styled workbook: branded title + period banner, bold turquoise header
// row, auto-filter, frozen header, sized columns, currency/number formats.
function buildDonorWorkbook(rows: Donor[], label: string, range: { start: string; end: string }): XLSX.WorkBook {
  const ncols = COLS.length;
  const headerR = 3;            // 0-based row index of the header
  const firstDataR = 4;
  const aoa: any[][] = [
    [`Muslim Hands France — Donateurs : ${label}`],
    [`Période : ${range.start} → ${range.end}  ·  ${rows.length} donateurs  ·  exporté le ${new Date().toLocaleDateString('fr-FR')}`],
    [],
    COLS.map((c) => c.header),
    ...rows.map(donorRow),
  ];
  const lastR = aoa.length - 1;
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: ncols - 1 } },
  ];
  ws['!cols'] = COLS.map((c) => ({ wch: c.width }));
  ws['!rows'] = [{ hpt: 24 }, { hpt: 16 }, { hpt: 6 }, { hpt: 26 }];
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerR, c: 0 }, e: { r: lastR, c: ncols - 1 } }) };

  // Title + banner.
  setCell(ws, 0, 0, { font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: MH_DARK } }, alignment: { horizontal: 'left', vertical: 'center' } });
  setCell(ws, 1, 0, { font: { sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: MH_TURQ } }, alignment: { horizontal: 'left', vertical: 'center' } });

  // Header row.
  for (let c = 0; c < ncols; c++) {
    setCell(ws, headerR, c, {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: MH_TURQ } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: thinBorder(MH_DARK),
    });
  }

  // Number formats ONLY on the numeric columns. We deliberately avoid setting a
  // per-cell style on every data cell — on large exports (50k+ rows) that bloats
  // the .xlsx to tens of MB. The styled header + widths + autofilter + number
  // formats give the "formatted" feel without the size blow-up.
  for (let c = 0; c < ncols; c++) {
    const kind = COLS[c].kind;
    if (!kind) continue;
    const z = kind === 'eur' ? '#,##0.00" €"' : '#,##0';
    for (let r = firstDataR; r <= lastR; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as any;
      if (cell) cell.z = z;
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Donateurs');
  return wb;
}

function slugify(label: string): string {
  return (label || 'selection')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'selection';
}

// Write the workbook to an .xlsx blob and trigger a download (browser-safe;
// avoids SheetJS's fs path). Runs synchronously to preserve the click gesture.
function triggerXlsxDownload(wb: XLSX.WorkBook, label: string) {
  // compression:true is essential — SheetJS stores the zip UNCOMPRESSED by
  // default, which makes a 56k-row export ~60MB instead of ~6MB.
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `donateurs_${slugify(label)}_${date}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Human-readable label for the downloaded file, derived from the slice.
export function sliceLabel(seed: Partial<ExtractionFilters>): string {
  const one = (a?: string[]) => (a && a.length === 1 ? a[0] : undefined);
  return (
    one(seed.cause) || one(seed.stip) || one(seed.dest) || one(seed.pay) ||
    one(seed.activite) || one(seed.palier) || one(seed.type) || one(seed.pcat) ||
    (seed.dept ? `dept-${seed.dept}` : '') ||
    (seed.ddept ? `dept-${seed.ddept}` : '') ||
    seed.dregion || seed.region || seed.city ||
    (seed.cause?.length ? 'toutes-causes' : '') ||
    (seed.stip?.length ? 'toutes-stipulations' : '') ||
    (seed.dest?.length ? 'toutes-destinations' : '') ||
    (seed.pay?.length ? 'tous-paiements' : '') ||
    'selection'
  );
}

/**
 * Filter records by a slice (merged with current date range), dedupe to distinct
 * donors, and download a FORMATTED .xlsx on the spot. Returns the number of
 * donors exported (0 = nothing matched, no file produced).
 */
export function downloadDonorsForSlice(
  records: ExtractionRecord[],
  seed: Partial<ExtractionFilters>,
  range: { start: string; end: string },
  opts?: { allTime?: boolean },
): number {
  // ---- Period-aware tier slice ----
  // A palier download with an active date range must classify donors by what
  // they gave WITHIN the range (not lifetime): date-scope the gifts, drop the
  // lifetime-tier filter, dedupe, then re-tier each donor on their period total.
  const isPalier = !!(seed.palier && seed.palier.length);
  const hasRange = !!(range.start || range.end);
  if (isPalier && hasRange && !opts?.allTime) {
    const filters: ExtractionFilters = {
      ...EMPTY_FILTERS,
      ...seed,
      palier: [], // lifetime tier attribute must NOT pre-filter
      dateFrom: range.start,
      dateTo: range.end,
    };
    const gifts = records.filter((r) => matchesGift(r, filters));
    const donors = dedupeDonors(gifts).filter((d) =>
      seed.palier!.includes(tierName(d.selAmount))
    );
    // The Palier column in the export reflects the PERIOD tier.
    for (const d of donors) d.tier = tierName(d.selAmount);
    if (!donors.length) return 0;
    const label = sliceLabel(seed);
    triggerXlsxDownload(buildDonorWorkbook(donors, label, range), label);
    return donors.length;
  }

  const filters: ExtractionFilters = {
    ...EMPTY_FILTERS,
    ...seed,
    // Donateurs-tab downloads are donor-attribute slices (not date-scoped) and
    // must include giftless donors (dt=''), so skip the date filter entirely.
    dateFrom: opts?.allTime ? '' : range.start,
    dateTo: opts?.allTime ? '' : range.end,
  };
  const gifts = records.filter((r) => matchesGift(r, filters));
  const donors = dedupeDonors(gifts);
  if (!donors.length) return 0;
  const label = sliceLabel(seed);
  triggerXlsxDownload(buildDonorWorkbook(donors, label, range), label);
  return donors.length;
}
