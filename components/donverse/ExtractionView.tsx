import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import {
  UploadCloud, ShieldCheck, Download, Loader2, AlertTriangle, Database,
  Filter, MousePointerClick,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { DonCard, SectionTitle } from './DonCard';
import { fmtNum, MH, PALETTE } from './format';

// =====================================================================
// ExtractionView — LOCAL-ONLY donor extraction workbench.
//
// PRIVACY: the donor file the user loads here is parsed in the browser,
// held only in React state (memory, this session), and used to generate
// CSV downloads locally. NOTHING is POSTed, fetched, persisted or sent
// anywhere. No /api calls. The published anonymized dashboard is untouched.
// =====================================================================

// ---- Département -> Région map (mirrors lib/aggregateDonverse) ----
const REGION_DEPTS: Record<string, string[]> = {
  'Auvergne-Rhône-Alpes': ['01','03','07','15','26','38','42','43','63','69','73','74'],
  'Bourgogne-Franche-Comté': ['21','25','39','58','70','71','89','90'],
  'Bretagne': ['22','29','35','56'],
  'Centre-Val de Loire': ['18','28','36','37','41','45'],
  'Corse': ['2A','2B'],
  'Grand Est': ['08','10','51','52','54','55','57','67','68','88'],
  'Hauts-de-France': ['02','59','60','62','80'],
  'Île-de-France': ['75','77','78','91','92','93','94','95'],
  'Normandie': ['14','27','50','61','76'],
  'Nouvelle-Aquitaine': ['16','17','19','23','24','33','40','47','64','79','86','87'],
  'Occitanie': ['09','11','12','30','31','32','34','46','48','65','66','81','82'],
  'Pays de la Loire': ['44','49','53','72','85'],
  "Provence-Alpes-Côte d'Azur": ['04','05','06','13','83','84'],
  'Guadeloupe': ['971'],
  'Martinique': ['972'],
  'Guyane': ['973'],
  'La Réunion': ['974'],
  'Mayotte': ['976'],
};
const DEPT_TO_REGION: Record<string, string> = {};
for (const [region, depts] of Object.entries(REGION_DEPTS)) {
  for (const d of depts) DEPT_TO_REGION[d] = region;
}
const VALID_DEPTS = new Set(Object.keys(DEPT_TO_REGION));

// Department code from a postal code (2A/2B + 97x logic, mirrors aggregateDonverse).
function deptFromPostal(pc: any): string | null {
  const s = (pc == null ? '' : String(pc)).trim();
  if (s === '' || !/^[0-9]/.test(s)) return null;
  if (s.startsWith('97') || s.startsWith('98')) {
    const code = s.slice(0, 3);
    return VALID_DEPTS.has(code) ? code : null;
  }
  const first2 = s.slice(0, 2);
  if (first2 === '20') {
    const num5 = parseInt(s.slice(0, 5).replace(/\D/g, ''), 10);
    return (!isNaN(num5) && num5 < 20200) ? '2A' : '2B';
  }
  return VALID_DEPTS.has(first2) ? first2 : null;
}

// ---- Derivation helpers (apply EXACT rules from the old tool) ----

// Consent per channel. Returns "IN" or "OUT".
const IN_VALUES = new Set(['opt-in', 'in', 'yes', 'oui', '1', 'true']);
function rgpdStatus(v: any): 'IN' | 'OUT' {
  const s = (v == null ? '' : String(v)).trim().toLowerCase();
  return IN_VALUES.has(s) ? 'IN' : 'OUT';
}

// Genre from Title.
function genreFromTitle(v: any): string {
  const s = (v == null ? '' : String(v)).trim().toLowerCase();
  if (['m. et mme', 'mr et mme', 'couple', 'm. & mme', 'mr & mme'].includes(s)) return 'Couple';
  if (['m.', 'm', 'mr', 'monsieur'].includes(s)) return 'Homme';
  if (['mme', 'madame', 'mlle', 'mademoiselle', 'ms', 'mrs', 'miss'].includes(s)) return 'Femme';
  return 'Non déterminé';
}

// Activité from Maximum Donation Date year.
function yearOf(d: any): number | null {
  if (d == null || d === '') return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.getUTCFullYear();
}
function activityName(maxDate: any): string {
  const y = yearOf(maxDate);
  if (y == null) return 'Inconnu';
  if (y >= 2024) return 'Actif (2024+)';
  if (y >= 2021) return 'Inactif (2021-23)';
  return 'Oublié (<2021)';
}

// Palier from Total Donation Amount.
function num(v: any): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function tierName(amount: number): string {
  if (amount >= 5000) return 'Major (≥5k€)';
  if (amount >= 1500) return 'Generous';
  if (amount >= 500) return 'Engaged';
  return 'Kind (<500€)';
}

// Date -> "YYYY-MM-DD" or '' for CSV / display.
function dayStr(d: any): string {
  if (d == null || d === '') return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const str = (v: any) => (v == null ? '' : String(v)).trim();

// ---- Enriched donor record (computed ONCE on load) ----
interface Donor {
  reference: string;
  title: string;
  firstName: string;
  lastName: string;
  orgName: string;
  email: string;
  phone: string;
  status: string;       // col Status
  type: string;         // Individual / Organization
  amount: number;       // Total Donation Amount
  address: string;      // lines joined
  postal: string;
  city: string;         // Locality
  dept: string;         // department code or ''
  region: string;       // region name or ''
  country: string;
  genre: string;
  activite: string;
  palier: string;
  rgpdPost: 'IN' | 'OUT';
  rgpdTel: 'IN' | 'OUT';
  rgpdEmail: 'IN' | 'OUT';
  minDate: string;      // Premier don
  maxDate: string;      // Dernier don
}

function enrich(r: any): Donor {
  const dept = deptFromPostal(r['Postal Code']);
  const address = ['Address Line 1', 'Address Line 2', 'Address Line 3', 'Address Line 4']
    .map((k) => str(r[k])).filter(Boolean).join(', ');
  const amount = num(r['Total Donation Amount']);
  return {
    reference: str(r['Reference']),
    title: str(r['Title']),
    firstName: str(r['First Name']),
    lastName: str(r['Last Name']),
    orgName: str(r['Organization Name']),
    email: str(r['Email']),
    phone: str(r['Telephone']),
    status: str(r['Status']),
    type: str(r['Type']) || 'Non déterminé',
    amount,
    address,
    postal: str(r['Postal Code']),
    city: str(r['Locality']),
    dept: dept || '',
    region: dept ? (DEPT_TO_REGION[dept] || '') : '',
    country: str(r['Country']),
    genre: genreFromTitle(r['Title']),
    activite: activityName(r['Maximum Donation Date']),
    palier: tierName(amount),
    rgpdPost: rgpdStatus(r['RGPD POST IN']),
    rgpdTel: rgpdStatus(r['RGPD TELEMARKETING']),
    rgpdEmail: rgpdStatus(r['RGPD EMAIL']),
    minDate: dayStr(r['Minimum Donation Date']),
    maxDate: dayStr(r['Maximum Donation Date']),
  };
}

// ---- Filter state ----
type Tri = 'tous' | 'IN' | 'OUT';
interface Filters {
  activite: string[];   // multi
  palier: string[];     // multi
  genre: string[];      // multi
  type: string[];       // multi (Individual / Organization)
  status: string;       // contains (col Status), '' = any
  amountMin: string;    // raw input
  amountMax: string;
  post: Tri;
  tel: Tri;
  email: Tri;
  region: string;       // exact, '' = any
  dept: string;         // exact, '' = any
  city: string;         // contains
}
const EMPTY_FILTERS: Filters = {
  activite: [], palier: [], genre: [], type: [], status: '',
  amountMin: '', amountMax: '', post: 'tous', tel: 'tous', email: 'tous',
  region: '', dept: '', city: '',
};

const ACT_OPTIONS = ['Actif (2024+)', 'Inactif (2021-23)', 'Oublié (<2021)', 'Inconnu'];
const TIER_OPTIONS = ['Kind (<500€)', 'Engaged', 'Generous', 'Major (≥5k€)'];
const GENRE_OPTIONS = ['Homme', 'Femme', 'Couple', 'Non déterminé'];

// AND-combined predicate over the enriched donor array.
function matches(d: Donor, f: Filters): boolean {
  if (f.activite.length && !f.activite.includes(d.activite)) return false;
  if (f.palier.length && !f.palier.includes(d.palier)) return false;
  if (f.genre.length && !f.genre.includes(d.genre)) return false;
  if (f.type.length && !f.type.includes(d.type)) return false;
  if (f.status && !d.status.toLowerCase().includes(f.status.toLowerCase())) return false;
  const min = f.amountMin === '' ? null : parseFloat(f.amountMin);
  const max = f.amountMax === '' ? null : parseFloat(f.amountMax);
  if (min != null && !isNaN(min) && d.amount < min) return false;
  if (max != null && !isNaN(max) && d.amount > max) return false;
  if (f.post !== 'tous' && d.rgpdPost !== f.post) return false;
  if (f.tel !== 'tous' && d.rgpdTel !== f.tel) return false;
  if (f.email !== 'tous' && d.rgpdEmail !== f.email) return false;
  if (f.region && d.region !== f.region) return false;
  if (f.dept && d.dept !== f.dept) return false;
  if (f.city && !d.city.toLowerCase().includes(f.city.toLowerCase())) return false;
  return true;
}

// ---- CSV (UTF-8 BOM + ';' separator, French-Excel friendly) ----
function buildCsv(rows: Donor[]): string {
  const records = rows.map((d) => ({
    'Reference': d.reference,
    'Civilité': d.title,
    'Prénom': d.firstName,
    'Nom': d.lastName,
    'Organisation': d.orgName,
    'Email': d.email,
    'Téléphone': d.phone,
    'Adresse': d.address,
    'Code postal': d.postal,
    'Ville': d.city,
    'Département': d.dept,
    'Région': d.region,
    'Pays': d.country,
    'Montant total': d.amount,
    'Activité': d.activite,
    'Palier': d.palier,
    'Statut': d.status,
    'Type': d.type,
    'RGPD Post': d.rgpdPost,
    'RGPD Téléphone': d.rgpdTel,
    'RGPD Email': d.rgpdEmail,
    'Premier don': d.minDate,
    'Dernier don': d.maxDate,
  }));
  const body = Papa.unparse(records, { delimiter: ';' });
  return '﻿' + body; // UTF-8 BOM
}

// Trigger a fully-local download (Blob + a[download]). No network involved.
function downloadCsv(rows: Donor[], label: string) {
  const csv = buildCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const slug = (label || 'selection')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'selection';
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `donateurs_${slug}_${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5">
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

// ---- Segment chart click-to-export wiring ----
// Each chart datum carries a `seg` predicate used to slice the filtered set.
interface SegDatum { name: string; count: number; seg: (d: Donor) => boolean; }
function segData(rows: Donor[], buckets: { name: string; seg: (d: Donor) => boolean }[]): SegDatum[] {
  return buckets.map((b) => ({ name: b.name, count: rows.filter(b.seg).length, seg: b.seg }));
}

// =====================================================================
// Main component
// =====================================================================
export interface ExtractionViewProps {
  /**
   * Optional seam for a future "map -> extraction" hook. When the map view
   * wants to pre-seed a geographic filter (e.g. a clicked department), it can
   * pass an initial filter patch here. Wiring the map is a SEPARATE follow-up;
   * this prop is a clean callback seam and is NOT required.
   */
  initialFilters?: Partial<Filters>;
}

export const ExtractionView: React.FC<ExtractionViewProps> = ({ initialFilters }) => {
  const [donors, setDonors] = useState<Donor[] | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, ...(initialFilters || {}) });
  const [presetLabel, setPresetLabel] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const set = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);

  // ---- Local file load: parse with SheetJS, enrich ONCE, keep in state. ----
  const onPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const sn = wb.SheetNames.find((s) => s.toLowerCase().includes('donateur')) || wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[sn], { defval: null, raw: false });
      if (!rows.length) throw new Error('Le fichier ne contient aucune ligne.');
      // Enrich (compute all derived fields) ONCE — then we only filter this array.
      const enriched = rows.map(enrich);
      setDonors(enriched);
      setFilters({ ...EMPTY_FILTERS, ...(initialFilters || {}) });
      setPresetLabel('');
    } catch (err: any) {
      setError(err?.message || String(err));
      setDonors(null);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [initialFilters]);

  // ---- Derived option lists from the loaded data (regions/depts present) ----
  const regionOptions = useMemo(() => {
    if (!donors) return [];
    return [...new Set(donors.map((d) => d.region).filter(Boolean))].sort();
  }, [donors]);
  const deptOptions = useMemo(() => {
    if (!donors) return [];
    const pool = filters.region
      ? donors.filter((d) => d.region === filters.region)
      : donors;
    return [...new Set(pool.map((d) => d.dept).filter(Boolean))].sort();
  }, [donors, filters.region]);
  const typeOptions = useMemo(() => {
    if (!donors) return [];
    return [...new Set(donors.map((d) => d.type).filter(Boolean))].sort();
  }, [donors]);

  // ---- The filtered set (recomputed when data or filters change) ----
  const filtered = useMemo(() => {
    if (!donors) return [];
    return donors.filter((d) => matches(d, filters));
  }, [donors, filters]);

  // ---- Presets ----
  const applyPreset = useCallback((label: string, patch: Partial<Filters>) => {
    setFilters({ ...EMPTY_FILTERS, ...patch });
    setPresetLabel(label);
  }, []);
  const PRESETS: { label: string; patch: Partial<Filters> }[] = [
    { label: 'Donateurs actifs', patch: { activite: ['Actif (2024+)'] } },
    { label: 'Actifs sans don récent', patch: { status: 'active', activite: ['Inactif (2021-23)', 'Oublié (<2021)'] } },
    { label: 'Dons > 500 €', patch: { amountMin: '500' } },
    { label: 'Major (≥5k €)', patch: { palier: ['Major (≥5k€)'] } },
    { label: 'Opt-in Téléphone', patch: { tel: 'IN' } },
    { label: 'Opt-in Email', patch: { email: 'IN' } },
    { label: 'Opt-in Courrier (Post)', patch: { post: 'IN' } },
    { label: 'Organisations', patch: { type: ['Organization'] } },
  ];

  const resetAll = useCallback(() => {
    setFilters({ ...EMPTY_FILTERS });
    setPresetLabel('');
  }, []);

  // ---- Segment chart data (respect the current filter panel) ----
  const genreChart = useMemo(() => segData(filtered, GENRE_OPTIONS.map((g) => ({ name: g, seg: (d: Donor) => d.genre === g }))), [filtered]);
  const typeChart = useMemo(() => segData(filtered, typeOptions.map((t) => ({ name: t, seg: (d: Donor) => d.type === t }))), [filtered, typeOptions]);
  const actChart = useMemo(() => segData(filtered, ACT_OPTIONS.map((a) => ({ name: a, seg: (d: Donor) => d.activite === a }))), [filtered]);
  const tierChart = useMemo(() => segData(filtered, TIER_OPTIONS.map((t) => ({ name: t, seg: (d: Donor) => d.palier === t }))), [filtered]);
  const postChart = useMemo(() => segData(filtered, [
    { name: 'IN', seg: (d: Donor) => d.rgpdPost === 'IN' }, { name: 'OUT', seg: (d: Donor) => d.rgpdPost === 'OUT' }]), [filtered]);
  const telChart = useMemo(() => segData(filtered, [
    { name: 'IN', seg: (d: Donor) => d.rgpdTel === 'IN' }, { name: 'OUT', seg: (d: Donor) => d.rgpdTel === 'OUT' }]), [filtered]);
  const emailChart = useMemo(() => segData(filtered, [
    { name: 'IN', seg: (d: Donor) => d.rgpdEmail === 'IN' }, { name: 'OUT', seg: (d: Donor) => d.rgpdEmail === 'OUT' }]), [filtered]);

  // Click a segment => export filtered ∩ that segment.
  const exportSeg = useCallback((dim: string, datum: SegDatum | undefined) => {
    if (!datum) return;
    const rows = filtered.filter(datum.seg);
    if (!rows.length) return;
    downloadCsv(rows, `${dim}-${datum.name}`);
  }, [filtered]);

  const exportSelection = useCallback(() => {
    if (!filtered.length) return;
    downloadCsv(filtered, presetLabel || 'selection');
  }, [filtered, presetLabel]);

  // ================= RENDER =================
  // Empty state — before any file is loaded.
  if (!donors) {
    return (
      <div className="space-y-6">
        <PrivacyBanner />
        <DonCard className="text-center">
          <Database size={40} className="mx-auto text-[#28B8D8] mb-3" />
          <h3 className="text-base font-bold text-gray-900 mb-1">
            Charger le fichier donateurs (Liste donateurs global) — reste local
          </h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-5">
            Le fichier est lu dans votre navigateur uniquement. Aucune donnée
            personnelle n’est envoyée, publiée ni enregistrée.
          </p>
          <label className="inline-flex items-center gap-2 cursor-pointer bg-[#28B8D8] hover:bg-[#1C8099] text-white text-sm font-medium rounded-lg px-5 py-2.5 transition-colors">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
            {busy ? 'Lecture…' : 'Choisir le fichier (.xlsx)'}
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" disabled={busy} onChange={onPick} />
          </label>
          {error && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-red-600">
              <AlertTriangle size={16} /> {error}
            </div>
          )}
        </DonCard>
      </div>
    );
  }

  // Loaded state.
  return (
    <div className="space-y-6">
      <PrivacyBanner />

      {/* Loaded summary + reload */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-3">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Database size={16} className="text-[#28B8D8]" />
          <span className="font-semibold">{fmtNum(donors.length)}</span> donateurs chargés
          {fileName && <span className="text-gray-400">· {fileName}</span>}
        </div>
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium text-gray-600 hover:text-[#1C8099] border border-gray-200 hover:border-[#45C9DF] rounded-md px-3 py-1.5 transition-colors self-start">
          <UploadCloud size={14} />
          Changer de fichier
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" disabled={busy} onChange={onPick} />
        </label>
      </div>

      {/* Presets */}
      <DonCard>
        <SectionTitle sub="Cliquez pour pré-remplir les filtres">Segments rapides</SectionTitle>
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
          <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Filtres (combinables)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <MultiSelect label="Activité" options={ACT_OPTIONS} value={filters.activite} onChange={(v) => set('activite', v)} />
          <MultiSelect label="Palier" options={TIER_OPTIONS} value={filters.palier} onChange={(v) => set('palier', v)} />
          <MultiSelect label="Genre" options={GENRE_OPTIONS} value={filters.genre} onChange={(v) => set('genre', v)} />
          <MultiSelect label="Type" options={typeOptions} value={filters.type} onChange={(v) => set('type', v)} />

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Montant total (€)</label>
            <div className="flex items-center gap-2">
              <input
                type="number" inputMode="decimal" placeholder="min"
                value={filters.amountMin} onChange={(e) => set('amountMin', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#28B8D8]"
              />
              <span className="text-gray-400 text-sm">–</span>
              <input
                type="number" inputMode="decimal" placeholder="max"
                value={filters.amountMax} onChange={(e) => set('amountMax', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#28B8D8]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Statut (contient)</label>
            <input
              type="text" placeholder="ex. active"
              value={filters.status} onChange={(e) => set('status', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#28B8D8]"
            />
          </div>

          <TriToggle label="Consentement Courrier (Post)" value={filters.post} onChange={(v) => set('post', v)} />
          <TriToggle label="Consentement Téléphone" value={filters.tel} onChange={(v) => set('tel', v)} />
          <TriToggle label="Consentement Email" value={filters.email} onChange={(v) => set('email', v)} />

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Région</label>
            <select
              value={filters.region}
              onChange={(e) => setFilters((f) => ({ ...f, region: e.target.value, dept: '' }))}
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:border-[#28B8D8]"
            >
              <option value="">Toutes</option>
              {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Département</label>
            <select
              value={filters.dept} onChange={(e) => set('dept', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:border-[#28B8D8]"
            >
              <option value="">Tous</option>
              {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Ville (contient)</label>
            <input
              type="text" placeholder="ex. PARIS"
              value={filters.city} onChange={(e) => set('city', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#28B8D8]"
            />
          </div>
        </div>
      </DonCard>

      {/* Live count + primary download */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#28B8D8]/5 border border-[#28B8D8]/30 rounded-xl px-5 py-4">
        <div className="text-sm text-gray-700">
          <span className="text-2xl font-bold text-[#1C8099] tabular-nums">{fmtNum(filtered.length)}</span>
          <span className="ml-2">donateurs correspondent aux filtres</span>
        </div>
        <button
          type="button"
          onClick={exportSelection}
          disabled={!filtered.length}
          className="inline-flex items-center justify-center gap-2 bg-[#28B8D8] hover:bg-[#1C8099] disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2.5 transition-colors"
        >
          <Download size={16} />
          Télécharger la sélection (CSV) — {fmtNum(filtered.length)} donateurs
        </button>
      </div>

      {/* Segment charts — click a segment to export that subset */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <MousePointerClick size={14} className="text-[#28B8D8]" />
        Cliquez un segment pour exporter ce sous-ensemble (filtres appliqués).
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Genre donut */}
        <DonCard>
          <SectionTitle sub="Cliquez une part pour exporter">Genre</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={genreChart} dataKey="count" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}
                onClick={(_, i) => exportSeg('genre', genreChart[i])} className="cursor-pointer">
                {genreChart.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmtNum(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </DonCard>

        {/* Type donut */}
        <DonCard>
          <SectionTitle sub="Cliquez une part pour exporter">Type</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={typeChart} dataKey="count" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}
                onClick={(_, i) => exportSeg('type', typeChart[i])} className="cursor-pointer">
                {typeChart.map((_, i) => <Cell key={i} fill={[MH.green, '#94a3b8', ...PALETTE][i % (PALETTE.length + 2)]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmtNum(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </DonCard>

        {/* Activité bar */}
        <DonCard>
          <SectionTitle sub="Cliquez une barre pour exporter">Activité</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
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

        {/* Palier bar */}
        <DonCard>
          <SectionTitle sub="Cliquez une barre pour exporter">Palier</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
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

      {/* RGPD IN/OUT bars (Post / Téléphone / Email) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <RgpdChart title="RGPD Courrier (Post)" data={postChart} onExport={(d) => exportSeg('rgpd-post', d)} />
        <RgpdChart title="RGPD Téléphone" data={telChart} onExport={(d) => exportSeg('rgpd-tel', d)} />
        <RgpdChart title="RGPD Email" data={emailChart} onExport={(d) => exportSeg('rgpd-email', d)} />
      </div>

      {/* Preview table (local PII — that's the point) */}
      <DonCard>
        <SectionTitle sub={`Aperçu local — ${Math.min(25, filtered.length)} premières lignes sur ${fmtNum(filtered.length)}`}>
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
                <th className="py-2 pr-3 font-semibold text-right">Montant</th>
                <th className="py-2 pr-3 font-semibold">Activité</th>
                <th className="py-2 pr-3 font-semibold">Palier</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 25).map((d, i) => (
                <tr key={d.reference || i} className="border-b border-gray-50 text-gray-700">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{[d.title, d.firstName, d.lastName].filter(Boolean).join(' ') || d.orgName || '—'}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{d.email || '—'}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{d.phone || '—'}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{d.city || '—'}</td>
                  <td className="py-1.5 pr-3">{d.dept || '—'}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtNum(d.amount)} €</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{d.activite}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{d.palier}</td>
                </tr>
              ))}
              {!filtered.length && (
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
      Ce fichier reste dans votre navigateur. Aucune donnée personnelle n’est
      envoyée ni publiée. L’extraction est 100 % locale — les CSV sont générés
      sur votre poste.
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
