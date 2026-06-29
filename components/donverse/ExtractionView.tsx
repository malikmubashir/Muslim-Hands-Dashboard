import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import {
  ShieldCheck, Download, Loader2, AlertTriangle, Database,
  Filter, MousePointerClick,
} from 'lucide-react';
import Papa from 'papaparse';
import { DonCard, SectionTitle } from './DonCard';
import { fmtNum, fmtEur, MH, PALETTE } from './format';
import { getExtractionRecords, type ExtractionRecord } from '../../services/donverseClient';

// =====================================================================
// ExtractionView — TRANSACTION-LEVEL donor extraction workbench.
//
// DATA SOURCE: the decrypted in-memory extraction dataset
// (services/donverseClient.getExtractionRecords). Each record is a
// gift-level row (one allocation) joined to donor contact + consent.
// NOTHING is uploaded — filtering + CSV downloads happen entirely in the
// browser. No plaintext-PII network calls.
//
// We answer transaction questions ("who paid Zakat", "who gave for
// Palestine", "Zakat for Mali") by filtering the GIFT records, then
// deduping to DISTINCT DONORS (by ref) for calling/emailing.
// =====================================================================

const str = (v: any) => (v == null ? '' : String(v)).trim();

// ---- Filter state ----
type Tri = 'tous' | 'IN' | 'OUT';
interface Filters {
  // transaction-level (a donor matches if >=1 gift matches)
  stip: string[];       // multi — stipulation
  dest: string[];       // multi — destination (Fund Dim 1)
  cause: string[];      // multi — cause / thème (Fund Dim 2)
  pay: string[];        // multi — payment method
  amountMin: string;    // per-gift montant min
  amountMax: string;    // per-gift montant max
  dateFrom: string;     // gift date >= (YYYY-MM-DD)
  dateTo: string;       // gift date <= (YYYY-MM-DD)
  // donor-level
  activite: string[];   // multi
  palier: string[];     // multi
  genre: string[];      // multi
  type: string[];       // multi (Individual / Organization)
  post: Tri;
  tel: Tri;
  email: Tri;
  region: string;       // exact, '' = any
  dept: string;         // exact, '' = any
  city: string;         // contains
}
// Public alias so callers (map/dashboard charts) can type a filter seed.
export type ExtractionFilters = Filters;

const EMPTY_FILTERS: Filters = {
  stip: [], dest: [], cause: [], pay: [],
  amountMin: '', amountMax: '', dateFrom: '', dateTo: '',
  activite: [], palier: [], genre: [], type: [],
  post: 'tous', tel: 'tous', email: 'tous',
  region: '', dept: '', city: '',
};

const ACT_OPTIONS = ['Actif (2024+)', 'Inactif (2021-23)', 'Oublié (<2021)', 'Inconnu'];
const TIER_OPTIONS = ['Kind (<500€)', 'Engaged', 'Generous', 'Major (≥5k€)'];
const GENRE_OPTIONS = ['Homme', 'Femme', 'Couple', 'Non déterminé'];

// Gift-level predicate. AND-combines transaction + donor criteria. A donor is
// kept if at least one of their gifts satisfies the gift predicate (handled by
// filtering the gift array, then deduping).
function matchesGift(r: ExtractionRecord, f: Filters): boolean {
  // transaction-level
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
  // donor-level
  if (f.activite.length && !f.activite.includes(r.act)) return false;
  if (f.palier.length && !f.palier.includes(r.tier)) return false;
  if (f.genre.length && !f.genre.includes(r.genre)) return false;
  if (f.type.length && !f.type.includes(r.type)) return false;
  if (f.post !== 'tous' && r.rPost !== f.post) return false;
  if (f.tel !== 'tous' && r.rTel !== f.tel) return false;
  if (f.email !== 'tous' && r.rEmail !== f.email) return false;
  if (f.region && r.reg !== f.region) return false;
  if (f.dept && r.dept !== f.dept) return false;
  if (f.city && !r.city.toLowerCase().includes(f.city.toLowerCase())) return false;
  return true;
}

// ---- Distinct donor (deduped by ref), aggregated within the current filter ----
interface Donor {
  ref: string;
  civ: string; fn: string; ln: string; nm: string;
  email: string; phone: string;
  addr: string; pc: string; city: string; dept: string; region: string; ctry: string;
  ltv: number;            // total donated, all periods (carried from record)
  selAmount: number;      // montant within the current selection
  selCount: number;       // nb gifts within the current selection
  causes: string[];       // distinct causes within selection
  stips: string[];        // distinct stipulations within selection
  dests: string[];        // distinct destinations within selection
  rPost: 'IN' | 'OUT'; rTel: 'IN' | 'OUT'; rEmail: 'IN' | 'OUT';
  act: string; tier: string; genre: string; type: string;
}

// Dedupe matching gift records into distinct donors. Records without a ref are
// kept as their own one-off donors (keyed by a synthetic id) so tx-only rows
// aren't merged together.
function dedupeDonors(rows: ExtractionRecord[]): Donor[] {
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
        dept: r.dept, region: r.reg, ctry: r.ctry,
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
    // Prefer the largest LTV seen (records carry the same donor LTV anyway).
    if (r.ltv > d.ltv) d.ltv = r.ltv;
  }
  return [...byRef.values()].sort((a, b) => b.selAmount - a.selAmount);
}

// ---- CSV (UTF-8 BOM + ';' separator, French-Excel friendly) ----
function buildDonorCsv(rows: Donor[]): string {
  const records = rows.map((d) => ({
    'Référence': d.ref,
    'Civilité': d.civ,
    'Prénom': d.fn,
    'Nom': d.ln,
    'Nom complet': d.nm,
    'Email': d.email,
    'Téléphone': d.phone,
    'Adresse': d.addr,
    'Code postal': d.pc,
    'Ville': d.city,
    'Département': d.dept,
    'Région': d.region,
    'Pays': d.ctry,
    'Total donné (toutes périodes)': d.ltv,
    'Montant dans la sélection': Math.round((d.selAmount + Number.EPSILON) * 100) / 100,
    'Nb dons (sélection)': d.selCount,
    'Causes (sélection)': d.causes.join(' | '),
    'Stipulations (sélection)': d.stips.join(' | '),
    'RGPD Post': d.rPost,
    'RGPD Téléphone': d.rTel,
    'RGPD Email': d.rEmail,
    'Activité': d.act,
    'Palier': d.tier,
    'Genre': d.genre,
    'Type': d.type,
  }));
  return '﻿' + Papa.unparse(records, { delimiter: ';' });
}

function buildGiftCsv(rows: ExtractionRecord[]): string {
  const records = rows.map((r) => ({
    'Date': r.dt,
    'Montant': r.amt,
    'Stipulation': r.stip,
    'Destination': r.dest,
    'Cause': r.cause,
    'Moyen de paiement': r.pay,
    'Référence': r.ref,
    'Nom complet': r.nm,
    'Email': r.email,
    'Téléphone': r.phone,
    'Adresse': r.addr,
    'Code postal': r.pc,
    'Ville': r.city,
    'Département': r.dept,
    'Région': r.reg,
    'Pays': r.ctry,
    'RGPD Post': r.rPost,
    'RGPD Téléphone': r.rTel,
    'RGPD Email': r.rEmail,
  }));
  return '﻿' + Papa.unparse(records, { delimiter: ';' });
}

function slugify(label: string): string {
  return (label || 'selection')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'selection';
}

function triggerDownload(csv: string, prefix: string, label: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefix}_${slugify(label)}_${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadDonors(rows: Donor[], label: string) {
  if (!rows.length) return;
  triggerDownload(buildDonorCsv(rows), 'donateurs', label);
}
function downloadGifts(rows: ExtractionRecord[], label: string) {
  if (!rows.length) return;
  triggerDownload(buildGiftCsv(rows), 'dons', label);
}

// ---- Small UI helpers ----
const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors ${
      active
        ? 'bg-[#28B8D8] border-[#28B8D8] text-white'
        : 'bg-white border-gray-200 text-gray-600 hover:border-[#45C9DF]'
    }`}
  >
    {children}
  </button>
);

const MultiSelect: React.FC<{ label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }> = ({ label, options, value, onChange }) => {
  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter((x) => x !== opt) : [...value, opt]);
  if (!options.length) return null;
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
        {options.map((o) => (
          <Chip key={o} active={value.includes(o)} onClick={() => toggle(o)}>{o}</Chip>
        ))}
      </div>
    </div>
  );
};

const TriToggle: React.FC<{ label: string; value: Tri; onChange: (v: Tri) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
    <div className="flex gap-1.5">
      {(['tous', 'IN', 'OUT'] as Tri[]).map((t) => (
        <Chip key={t} active={value === t} onClick={() => onChange(t)}>
          {t === 'tous' ? 'Tous' : t}
        </Chip>
      ))}
    </div>
  </div>
);

// ---- Segment chart click-to-export wiring (over DONORS) ----
interface SegDatum { name: string; count: number; seg: (d: Donor) => boolean; }
function segData(rows: Donor[], buckets: { name: string; seg: (d: Donor) => boolean }[]): SegDatum[] {
  return buckets
    .map((b) => ({ name: b.name, count: rows.filter(b.seg).length, seg: b.seg }))
    .filter((d) => d.count > 0);
}

// =====================================================================
// Main component
// =====================================================================
export interface ExtractionViewProps {
  /**
   * Optional seed from the map or dashboard charts. Merged onto the current
   * filters on mount and whenever it changes, so the pre-filter survives even
   * before/while the dataset is loading.
   */
  initialFilters?: Partial<Filters>;
}

export const ExtractionView: React.FC<ExtractionViewProps> = ({ initialFilters }) => {
  const [records, setRecords] = useState<ExtractionRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, ...(initialFilters || {}) });
  const [presetLabel, setPresetLabel] = useState<string>('');

  const set = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);

  // ---- Fetch + decrypt the in-memory dataset ONCE on mount. ----
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getExtractionRecords()
      .then((recs) => { if (alive) setRecords(recs); })
      .catch((e: any) => { if (alive) setError(String(e?.message || e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Apply a seed (map / dashboard charts). Merge onto current filters whenever
  // the prop changes, so the pre-filter isn't lost.
  useEffect(() => {
    if (initialFilters && Object.keys(initialFilters).length) {
      setFilters((f) => ({ ...f, ...initialFilters }));
      setPresetLabel('');
    }
  }, [initialFilters]);

  // ---- Precompute distinct filter-option lists ONCE from the dataset. ----
  const opts = useMemo(() => {
    const stip = new Set<string>(), dest = new Set<string>(), cause = new Set<string>(),
      pay = new Set<string>(), type = new Set<string>(), region = new Set<string>();
    if (records) {
      for (const r of records) {
        if (r.stip) stip.add(r.stip);
        if (r.dest) dest.add(r.dest);
        if (r.cause) cause.add(r.cause);
        if (r.pay) pay.add(r.pay);
        if (r.type) type.add(r.type);
        if (r.reg) region.add(r.reg);
      }
    }
    const srt = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, 'fr'));
    return {
      stip: srt(stip), dest: srt(dest), cause: srt(cause), pay: srt(pay),
      type: srt(type), region: srt(region),
    };
  }, [records]);

  // Department options depend on the chosen region.
  const deptOptions = useMemo(() => {
    if (!records) return [];
    const pool = filters.region ? records.filter((r) => r.reg === filters.region) : records;
    return [...new Set(pool.map((r) => r.dept).filter(Boolean))].sort();
  }, [records, filters.region]);

  // ---- Filtered GIFTS + distinct DONORS (deduped). ----
  const filteredGifts = useMemo(() => {
    if (!records) return [];
    return records.filter((r) => matchesGift(r, filters));
  }, [records, filters]);

  const donors = useMemo(() => dedupeDonors(filteredGifts), [filteredGifts]);

  // ---- Presets ----
  const applyPreset = useCallback((label: string, patch: Partial<Filters>) => {
    setFilters({ ...EMPTY_FILTERS, ...patch });
    setPresetLabel(label);
  }, []);
  const PRESETS: { label: string; patch: Partial<Filters> }[] = [
    { label: 'Ont payé la Zakat', patch: { stip: opts.stip.filter((s) => /zakat/i.test(s)) } },
    { label: "Ont payé l'intérêt", patch: { stip: opts.stip.filter((s) => /int[ée]r[êe]t/i.test(s)) } },
    { label: 'Don pour la Palestine', patch: { dest: opts.dest.filter((d) => /palestine/i.test(d)) } },
    { label: 'Zakat pour le Mali', patch: {
        stip: opts.stip.filter((s) => /zakat/i.test(s)),
        dest: opts.dest.filter((d) => /mali/i.test(d)),
      } },
    { label: 'Opt-in Téléphone', patch: { tel: 'IN' } },
    { label: 'Opt-in Email', patch: { email: 'IN' } },
    { label: 'Donateurs actifs', patch: { activite: ['Actif (2024+)'] } },
    { label: 'Dons > 500 €', patch: { amountMin: '500' } },
    { label: 'Major (≥5k €)', patch: { palier: ['Major (≥5k€)'] } },
    { label: 'Organisations', patch: { type: opts.type.filter((t) => /organi/i.test(t)) } },
  ];

  const resetAll = useCallback(() => {
    setFilters({ ...EMPTY_FILTERS });
    setPresetLabel('');
  }, []);

  // ---- Segment charts (over the distinct donors of the current filter) ----
  const stipChart = useMemo(() => segData(donors, opts.stip.map((s) => ({ name: s, seg: (d: Donor) => d.stips.includes(s) }))), [donors, opts.stip]);
  const destChart = useMemo(() => segData(donors, opts.dest.map((dd) => ({ name: dd, seg: (d: Donor) => d.dests.includes(dd) }))), [donors, opts.dest]);
  const causeChart = useMemo(() => segData(donors, opts.cause.map((c) => ({ name: c, seg: (d: Donor) => d.causes.includes(c) }))), [donors, opts.cause]);
  const tierChart = useMemo(() => segData(donors, TIER_OPTIONS.map((t) => ({ name: t, seg: (d: Donor) => d.tier === t }))), [donors]);
  const actChart = useMemo(() => segData(donors, ACT_OPTIONS.map((a) => ({ name: a, seg: (d: Donor) => d.act === a }))), [donors]);
  const cityChart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of donors) { const c = d.city || '—'; counts.set(c, (counts.get(c) || 0) + 1); }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([name]) => ({ name, count: counts.get(name) || 0, seg: (d: Donor) => (d.city || '—') === name }));
  }, [donors]);
  const postChart = useMemo(() => segData(donors, [
    { name: 'IN', seg: (d: Donor) => d.rPost === 'IN' }, { name: 'OUT', seg: (d: Donor) => d.rPost === 'OUT' }]), [donors]);
  const telChart = useMemo(() => segData(donors, [
    { name: 'IN', seg: (d: Donor) => d.rTel === 'IN' }, { name: 'OUT', seg: (d: Donor) => d.rTel === 'OUT' }]), [donors]);
  const emailChart = useMemo(() => segData(donors, [
    { name: 'IN', seg: (d: Donor) => d.rEmail === 'IN' }, { name: 'OUT', seg: (d: Donor) => d.rEmail === 'OUT' }]), [donors]);

  const exportSeg = useCallback((dim: string, datum: SegDatum | undefined) => {
    if (!datum) return;
    const rows = donors.filter(datum.seg);
    downloadDonors(rows, `${dim}-${datum.name}`);
  }, [donors]);

  const exportSelection = useCallback(() => {
    downloadDonors(donors, presetLabel || 'selection');
  }, [donors, presetLabel]);
  const exportGiftRows = useCallback(() => {
    downloadGifts(filteredGifts, presetLabel || 'selection');
  }, [filteredGifts, presetLabel]);

  // ================= RENDER =================
  // Loading (fetch + decrypt).
  if (loading) {
    return (
      <div className="space-y-6">
        <PrivacyBanner />
        <DonCard className="text-center py-16">
          <Loader2 size={28} className="mx-auto text-[#28B8D8] animate-spin mb-3" />
          <p className="text-sm text-gray-600">Déchiffrement des données…</p>
        </DonCard>
      </div>
    );
  }

  // Error / empty (no extraction stored — e.g. dev, or before first import).
  if (error || !records || !records.length) {
    return (
      <div className="space-y-6">
        <PrivacyBanner />
        <DonCard className="text-center py-16">
          <Database size={40} className="mx-auto text-[#28B8D8] mb-3" />
          <h3 className="text-base font-bold text-gray-900 mb-1">Aucune extraction disponible</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Importez d’abord les données via « Mettre à jour les données ».
          </p>
          {error && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-red-600">
              <AlertTriangle size={16} /> {error}
            </div>
          )}
        </DonCard>
      </div>
    );
  }

  // Ready.
  return (
    <div className="space-y-6">
      <PrivacyBanner />

      {/* Loaded summary */}
      <div className="flex items-center gap-2 text-sm text-gray-700 bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-3">
        <Database size={16} className="text-[#28B8D8]" />
        <span className="font-semibold">{fmtNum(records.length)}</span> dons (lignes) déchiffrés ·
        <span className="font-semibold ml-1">{fmtNum(dedupeDonors(records).length)}</span> donateurs distincts
      </div>

      {/* Presets */}
      <DonCard>
        <SectionTitle sub="Cliquez pour pré-remplir les filtres (questions transactionnelles)">Segments rapides</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.label, p.patch)}
              className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors ${
                presetLabel === p.label
                  ? 'bg-[#28B8D8] border-[#28B8D8] text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-[#45C9DF]'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={resetAll}
            className="text-xs font-medium rounded-full px-3 py-1.5 border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-colors"
          >
            Réinitialiser
          </button>
        </div>
      </DonCard>

      {/* Filter panel */}
      <DonCard>
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-[#28B8D8]" />
          <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Filtres (combinés — ET)</h3>
        </div>

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Transaction</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          <MultiSelect label="Stipulation" options={opts.stip} value={filters.stip} onChange={(v) => set('stip', v)} />
          <MultiSelect label="Destination" options={opts.dest} value={filters.dest} onChange={(v) => set('dest', v)} />
          <MultiSelect label="Cause / Thème" options={opts.cause} value={filters.cause} onChange={(v) => set('cause', v)} />
          <MultiSelect label="Moyen de paiement" options={opts.pay} value={filters.pay} onChange={(v) => set('pay', v)} />

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Montant du don (€)</label>
            <div className="flex items-center gap-2">
              <input type="number" inputMode="decimal" placeholder="min"
                value={filters.amountMin} onChange={(e) => set('amountMin', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#28B8D8]" />
              <span className="text-gray-400 text-sm">–</span>
              <input type="number" inputMode="decimal" placeholder="max"
                value={filters.amountMax} onChange={(e) => set('amountMax', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#28B8D8]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Période (date du don)</label>
            <div className="flex items-center gap-2">
              <input type="date" value={filters.dateFrom} onChange={(e) => set('dateFrom', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#28B8D8]" />
              <span className="text-gray-400 text-sm">–</span>
              <input type="date" value={filters.dateTo} onChange={(e) => set('dateTo', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#28B8D8]" />
            </div>
          </div>
        </div>

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Donateur</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <MultiSelect label="Activité" options={ACT_OPTIONS} value={filters.activite} onChange={(v) => set('activite', v)} />
          <MultiSelect label="Palier" options={TIER_OPTIONS} value={filters.palier} onChange={(v) => set('palier', v)} />
          <MultiSelect label="Genre" options={GENRE_OPTIONS} value={filters.genre} onChange={(v) => set('genre', v)} />
          <MultiSelect label="Type" options={opts.type} value={filters.type} onChange={(v) => set('type', v)} />

          <TriToggle label="Consentement Courrier (Post)" value={filters.post} onChange={(v) => set('post', v)} />
          <TriToggle label="Consentement Téléphone" value={filters.tel} onChange={(v) => set('tel', v)} />
          <TriToggle label="Consentement Email" value={filters.email} onChange={(v) => set('email', v)} />

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Région</label>
            <select value={filters.region}
              onChange={(e) => setFilters((f) => ({ ...f, region: e.target.value, dept: '' }))}
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:border-[#28B8D8]">
              <option value="">Toutes</option>
              {opts.region.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Département</label>
            <select value={filters.dept} onChange={(e) => set('dept', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:border-[#28B8D8]">
              <option value="">Tous</option>
              {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Ville (contient)</label>
            <input type="text" placeholder="ex. PARIS"
              value={filters.city} onChange={(e) => set('city', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#28B8D8]" />
          </div>
        </div>
      </DonCard>

      {/* Live count + downloads */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#28B8D8]/5 border border-[#28B8D8]/30 rounded-xl px-5 py-4">
        <div className="text-sm text-gray-700">
          <span className="text-2xl font-bold text-[#1C8099] tabular-nums">{fmtNum(donors.length)}</span>
          <span className="ml-2">donateurs</span>
          <span className="mx-2 text-gray-300">·</span>
          <span className="font-semibold tabular-nums">{fmtNum(filteredGifts.length)}</span>
          <span className="ml-1">dons correspondants</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportSelection} disabled={!donors.length}
            className="inline-flex items-center justify-center gap-2 bg-[#28B8D8] hover:bg-[#1C8099] disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2.5 transition-colors">
            <Download size={16} />
            Télécharger les donateurs (CSV) — {fmtNum(donors.length)} donateurs
          </button>
          <button type="button" onClick={exportGiftRows} disabled={!filteredGifts.length}
            className="inline-flex items-center justify-center gap-2 border border-[#28B8D8] text-[#1C8099] hover:bg-[#28B8D8]/10 disabled:opacity-50 text-sm font-medium rounded-lg px-4 py-2.5 transition-colors">
            <Download size={16} />
            Télécharger les dons (lignes)
          </button>
        </div>
      </div>

      {/* Segment charts — click a segment to export the donors in it */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <MousePointerClick size={14} className="text-[#28B8D8]" />
        Cliquez un segment pour exporter les donateurs correspondants (filtres appliqués).
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stipulation donut */}
        <DonCard>
          <SectionTitle sub="Cliquez une part pour exporter">Stipulation</SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={stipChart} dataKey="count" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}
                onClick={(_, i) => exportSeg('stipulation', stipChart[i])} className="cursor-pointer">
                {stipChart.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmtNum(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </DonCard>

        {/* Destination bar */}
        <DonCard>
          <SectionTitle sub="Cliquez une barre pour exporter">Destination</SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={destChart.slice(0, 12)} layout="vertical" margin={{ left: 10, right: 24 }}>
              <CartesianGrid horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tickFormatter={fmtNum} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#334155' }} />
              <Tooltip formatter={(v: number) => fmtNum(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} onClick={(_, i) => exportSeg('destination', destChart[i])} className="cursor-pointer">
                {destChart.slice(0, 12).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </DonCard>

        {/* Cause bar */}
        <DonCard>
          <SectionTitle sub="Cliquez une barre pour exporter">Cause / Thème</SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={causeChart.slice(0, 12)} layout="vertical" margin={{ left: 10, right: 24 }}>
              <CartesianGrid horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tickFormatter={fmtNum} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#334155' }} />
              <Tooltip formatter={(v: number) => fmtNum(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} onClick={(_, i) => exportSeg('cause', causeChart[i])} className="cursor-pointer">
                {causeChart.slice(0, 12).map((_, i) => <Cell key={i} fill={PALETTE[(i + 2) % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </DonCard>

        {/* Ville bar */}
        <DonCard>
          <SectionTitle sub="Top 12 villes — cliquez pour exporter">Ville</SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={cityChart} layout="vertical" margin={{ left: 10, right: 24 }}>
              <CartesianGrid horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tickFormatter={fmtNum} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#334155' }} />
              <Tooltip formatter={(v: number) => fmtNum(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} onClick={(_, i) => exportSeg('ville', cityChart[i])} className="cursor-pointer">
                {cityChart.map((_, i) => <Cell key={i} fill={PALETTE[(i + 4) % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </DonCard>
      </div>

      {/* RGPD IN/OUT bars (Post / Téléphone / Email) — over donors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <RgpdChart title="RGPD Courrier (Post)" data={postChart} onExport={(d) => exportSeg('rgpd-post', d)} />
        <RgpdChart title="RGPD Téléphone" data={telChart} onExport={(d) => exportSeg('rgpd-tel', d)} />
        <RgpdChart title="RGPD Email" data={emailChart} onExport={(d) => exportSeg('rgpd-email', d)} />
      </div>

      {/* Activité + Palier bars (donor segments) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DonCard>
          <SectionTitle sub="Cliquez une barre pour exporter">Activité</SectionTitle>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={actChart} margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" height={56} />
              <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: '#64748b' }} width={56} />
              <Tooltip formatter={(v: number) => fmtNum(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} onClick={(_, i) => exportSeg('activite', actChart[i])} className="cursor-pointer">
                {actChart.map((_, i) => <Cell key={i} fill={PALETTE[(i + 1) % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </DonCard>
        <DonCard>
          <SectionTitle sub="Cliquez une barre pour exporter">Palier</SectionTitle>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={tierChart} margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" height={56} />
              <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: '#64748b' }} width={56} />
              <Tooltip formatter={(v: number) => fmtNum(v)} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} onClick={(_, i) => exportSeg('palier', tierChart[i])} className="cursor-pointer">
                {tierChart.map((_, i) => <Cell key={i} fill={[MH.greenLight, MH.greenMid, MH.green, MH.greenDark][i % 4]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </DonCard>
      </div>

      {/* Preview table — first ~25 matching donors */}
      <DonCard>
        <SectionTitle sub={`Aperçu local — ${Math.min(25, donors.length)} premiers donateurs sur ${fmtNum(donors.length)}`}>
          Aperçu de la sélection
        </SectionTitle>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-3 font-semibold">Nom</th>
                <th className="py-2 pr-3 font-semibold">Email</th>
                <th className="py-2 pr-3 font-semibold">Téléphone</th>
                <th className="py-2 pr-3 font-semibold">Ville</th>
                <th className="py-2 pr-3 font-semibold">Dép.</th>
                <th className="py-2 pr-3 font-semibold text-right">Montant (sél.)</th>
                <th className="py-2 pr-3 font-semibold text-right">Nb dons</th>
                <th className="py-2 pr-3 font-semibold">Causes</th>
              </tr>
            </thead>
            <tbody>
              {donors.slice(0, 25).map((d, i) => (
                <tr key={d.ref || i} className="border-b border-gray-50 text-gray-700">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{[d.civ, d.fn, d.ln].filter(Boolean).join(' ') || d.nm || '—'}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{d.email || '—'}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{d.phone || '—'}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{d.city || '—'}</td>
                  <td className="py-1.5 pr-3">{d.dept || '—'}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtEur(d.selAmount)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtNum(d.selCount)}</td>
                  <td className="py-1.5 pr-3 max-w-[16rem] truncate" title={d.causes.join(', ')}>{d.causes.join(', ') || '—'}</td>
                </tr>
              ))}
              {!donors.length && (
                <tr><td colSpan={8} className="py-6 text-center text-gray-400">Aucun donateur ne correspond aux filtres.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </DonCard>
    </div>
  );
};

// ---- Sub-components ----
const PrivacyBanner: React.FC = () => (
  <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-800">
    <ShieldCheck size={16} className="mt-0.5 shrink-0" />
    <span>
      Données déchiffrées localement dans votre navigateur. Les exports sont
      générés sur votre poste.
    </span>
  </div>
);

const RgpdChart: React.FC<{ title: string; data: SegDatum[]; onExport: (d: SegDatum) => void }> = ({ title, data, onExport }) => (
  <DonCard>
    <SectionTitle sub="IN / OUT — cliquez pour exporter">{title}</SectionTitle>
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 8, right: 16 }}>
        <CartesianGrid stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: '#64748b' }} width={48} />
        <Tooltip formatter={(v: number) => fmtNum(v)} cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} onClick={(_, i) => onExport(data[i])} className="cursor-pointer">
          {data.map((d, i) => <Cell key={i} fill={d.name === 'IN' ? MH.green : '#cbd5e1'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </DonCard>
);

export default ExtractionView;
