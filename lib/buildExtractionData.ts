// lib/buildExtractionData.ts
//
// Pure, I/O-free builder for the COMBINED donor+transaction EXTRACTION dataset.
//
// This is the ONLY place that produces a record carrying contact PII. The output
// is encrypted (services/cryptoStore.ts) before it ever leaves the browser; the
// server only ever stores the ciphertext. Keep this module side-effect-free.
//
// For each TRANSACTION (allocation) row we emit one enriched record joined to
// the donor contact/consent row by Reference. If no donor match exists we fall
// back to the tx-level identity columns (Account Name / Address / Email).
//
// Field keys are kept SHORT because the dataset is large (~160k records).

// ---- Département -> Région (mirrors lib/aggregateDonverse + ExtractionView) ----
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

// ---- Theme / stipulation / payment normalization (mirrors aggregateDonverse) ----
const THEME_CANON: Record<string, string> = {
  'orphelins': 'Orphelins',
  'fonds general': 'Fonds général',
  'eau potable': 'Eau potable',
  'urgences': 'Urgences',
  'aide alimentaire': 'Aide alimentaire',
  'generation de revenus': 'Génération de revenus',
  'generations de revenue': 'Génération de revenus',
  'activites generatrices de revenus': 'Génération de revenus',
  'sante': 'Santé',
  'education': 'Éducation',
  'environement': 'Environnement',
  'environnement': 'Environnement',
  'enfance': 'Enfance',
};
function themeKey(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
const STIP_MAP: Record<string, string> = {
  'Zakat El MAal': 'Zakat El Maal',
  'Don / Sadaqa': 'Sadaqa',
  'Don/Sadaqa': 'Sadaqa',
  'Don / sadaqa': 'Sadaqa',
  'Intérêts bancaires': 'Intérêt',
  'Interets bancaires': 'Intérêt',
  'Intérêt bancaire': 'Intérêt',
};
function normTheme(v: any): string {
  const t = (v == null ? '' : String(v)).trim();
  if (t === '') return 'Non spécifié';
  return THEME_CANON[themeKey(t)] || t;
}
function normStip(v: any): string {
  const t = (v == null ? '' : String(v)).trim();
  if (t === '') return 'Non spécifié';
  return STIP_MAP[t] || t;
}
function normPayment(v: any): string {
  const raw = (v == null ? '' : String(v));
  const t = raw.split(' - ')[0].trim();
  return t === '' ? 'Non spécifié' : t;
}
function normSimple(v: any): string {
  const t = (v == null ? '' : String(v)).trim();
  return t === '' ? 'Non spécifié' : t;
}

// ---- Donor derivation helpers (apply EXACT rules from ExtractionView) ----
const IN_VALUES = new Set(['opt-in', 'in', 'yes', 'oui', '1', 'true']);
function rgpdStatus(v: any): 'IN' | 'OUT' {
  const s = (v == null ? '' : String(v)).trim().toLowerCase();
  return IN_VALUES.has(s) ? 'IN' : 'OUT';
}
function genreFromTitle(v: any): string {
  const s = (v == null ? '' : String(v)).trim().toLowerCase();
  if (['m. et mme', 'mr et mme', 'couple', 'm. & mme', 'mr & mme'].includes(s)) return 'Couple';
  if (['m.', 'm', 'mr', 'monsieur'].includes(s)) return 'Homme';
  if (['mme', 'madame', 'mlle', 'mademoiselle', 'ms', 'mrs', 'miss'].includes(s)) return 'Femme';
  return 'Non déterminé';
}
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
function num(v: any): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
// NOTE: these strings MUST match aggregateDonverse.tierName so the Donateurs-tab
// segment downloads line up exactly with the displayed counts.
function tierName(amount: number): string {
  if (amount >= 5000) return 'Major (≥5k)';
  if (amount >= 1500) return 'Generous (1.5-5k)';
  if (amount >= 500) return 'Engaged (500-1.5k)';
  return 'Kind (<500)';
}
function dayStr(d: any): string {
  if (d == null || d === '') return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const str = (v: any) => (v == null ? '' : String(v)).trim();

// =====================================================================
// Enriched record shape (SHORT keys to keep ~160k records compact).
// =====================================================================
export interface ExtractionRecord {
  // transaction facts
  dt: string;        // date "YYYY-MM-DD"
  amt: number;       // montant (Allocation Amount Base)
  stip: string;      // stipulation (normalized, incl. Sadaqa/Intérêt merges)
  dest: string;      // destination (Fund Dimension 1)
  cause: string;     // cause (Fund Dimension 2, normalized themes)
  pay: string;       // payment (normalized)
  dept: string;      // department code or ''
  reg: string;       // region name or ''
  city: string;      // tx Locality
  pc: string;        // tx Postal Code
  ref: string;       // donorRef (Account Reference)
  // joined donor identity / contact (falls back to tx-level if no donor match)
  civ: string;       // civility (Title)
  fn: string;        // firstName
  ln: string;        // lastName
  nm: string;        // display name (tx Account Name fallback)
  email: string;
  phone: string;
  addr: string;      // address lines 1-4 joined (donor) or tx Address fallback
  loc: string;       // donor locality
  dpc: string;       // donor postalCode
  ctry: string;      // country
  // donor analytics / consent
  ltv: number;       // totalDonation (donor Total Donation Amount)
  rPost: 'IN' | 'OUT';   // rgpdPost
  rTel: 'IN' | 'OUT';    // rgpdTel (RGPD TELEMARKETING)
  rEmail: 'IN' | 'OUT';  // rgpdEmail (RGPD EMAIL)
  pcat: string;      // raw RGPD POST category (Opt-In / Opt-Out / Non renseigné / …) — matches Donateurs consent chart
  act: string;       // activity
  tier: string;      // tier
  genre: string;     // genre from Title
  type: string;      // Individual / Organization
  ddept: string;     // donor HOME department (from donor postal) — for Donateurs region downloads
  dreg: string;      // donor HOME region
  matched: 0 | 1;    // 1 if a donor row was joined, 0 if tx-only fallback
}

export interface ExtractionDataset {
  meta: { generatedAt: string; rows: number; txTotalBase: number };
  records: ExtractionRecord[];
}

interface DonorInfo {
  civ: string; fn: string; ln: string; email: string; phone: string;
  addr: string; loc: string; dpc: string; ctry: string;
  ltv: number; rPost: 'IN' | 'OUT'; rTel: 'IN' | 'OUT'; rEmail: 'IN' | 'OUT';
  pcat: string; act: string; tier: string; genre: string; type: string;
  ddept: string; dreg: string;
}

function buildDonorInfo(r: any): DonorInfo {
  const amount = num(r['Total Donation Amount']);
  const addr = ['Address Line 1', 'Address Line 2', 'Address Line 3', 'Address Line 4']
    .map((k) => str(r[k])).filter(Boolean).join(', ');
  const ddept = deptFromPostal(r['Postal Code']);
  return {
    civ: str(r['Title']),
    fn: str(r['First Name']),
    ln: str(r['Last Name']) || str(r['Organization Name']),
    email: str(r['Email']),
    phone: str(r['Telephone']),
    addr,
    loc: str(r['Locality']),
    dpc: str(r['Postal Code']),
    ctry: str(r['Country']),
    ltv: amount,
    rPost: rgpdStatus(r['RGPD POST IN']),
    rTel: rgpdStatus(r['RGPD TELEMARKETING']),
    rEmail: rgpdStatus(r['RGPD EMAIL']),
    pcat: str(r['RGPD POST IN']) || 'Non renseigné',
    act: activityName(r['Maximum Donation Date']),
    tier: tierName(amount),
    genre: genreFromTitle(r['Title']),
    type: normSimple(r['Type']),
    ddept: ddept || '',
    dreg: ddept ? (DEPT_TO_REGION[ddept] || '') : '',
  };
}

/**
 * Build the combined extraction dataset (one record per transaction allocation
 * row, joined to donor contact/consent by Reference). PURE — no I/O.
 */
export function buildExtractionData(txRows: any[], donorRows: any[]): ExtractionDataset {
  // Donor lookup by Reference.
  const donorByRef = new Map<string, DonorInfo>();
  for (const r of donorRows) {
    const ref = str(r['Reference']);
    if (ref) donorByRef.set(ref, buildDonorInfo(r));
  }

  const records: ExtractionRecord[] = [];
  const seenRefs = new Set<string>();
  let txTotalBase = 0;

  for (const r of txRows) {
    const amt = num(r['Allocation Amount (Base)']);
    txTotalBase += amt;

    const ref = str(r['Account Reference']);
    if (ref) seenRefs.add(ref);
    const dept = deptFromPostal(r['Postal Code']);
    const d = ref ? donorByRef.get(ref) : undefined;

    // tx-level fallback identity (used when no donor match).
    const txName = str(r['Account Name']);
    const txAddr = str(r['Address (Multi-Line)']) || str(r['Address (Single-Line)']);
    const txEmail = str(r['Email Address']);
    const txCity = str(r['Locality']);
    const txPc = str(r['Postal Code']);
    const txCtry = str(r['Address Country']);

    records.push({
      dt: dayStr(r['Date']),
      amt,
      stip: normStip(r['Fund Dimension 3']),
      dest: normSimple(r['Fund Dimension 1']),
      cause: normTheme(r['Fund Dimension 2']),
      pay: normPayment(r['Payment Method']),
      dept: dept || '',
      reg: dept ? (DEPT_TO_REGION[dept] || '') : '',
      city: txCity,
      pc: txPc,
      ref,
      civ: d ? d.civ : '',
      fn: d ? d.fn : '',
      ln: d ? d.ln : txName,
      nm: txName || (d ? `${d.fn} ${d.ln}`.trim() : ''),
      email: d ? (d.email || txEmail) : txEmail,
      phone: d ? d.phone : '',
      addr: d ? (d.addr || txAddr) : txAddr,
      loc: d ? d.loc : txCity,
      dpc: d ? d.dpc : txPc,
      ctry: d ? (d.ctry || txCtry) : txCtry,
      ltv: d ? d.ltv : 0,
      rPost: d ? d.rPost : 'OUT',
      rTel: d ? d.rTel : 'OUT',
      rEmail: d ? d.rEmail : 'OUT',
      pcat: d ? d.pcat : 'Non renseigné',
      act: d ? d.act : 'Inconnu',
      tier: d ? d.tier : 'Kind (<500)',
      genre: d ? d.genre : 'Non déterminé',
      type: d ? d.type : normSimple(r['Type']),
      ddept: d ? d.ddept : '',
      dreg: d ? d.dreg : '',
      matched: d ? 1 : 0,
    });
  }

  // Append donor-level records for donors with NO 2025 gift, so the Donateurs
  // tab (full donor base) can export every segment — not just the gift-active
  // subset. These carry empty gift fields (dt/amt/cause/…); geo = donor home.
  for (const r of donorRows) {
    const ref = str(r['Reference']);
    if (!ref || seenRefs.has(ref)) continue;
    const info = donorByRef.get(ref);
    if (!info) continue;
    seenRefs.add(ref);
    records.push({
      dt: '', amt: 0, stip: '', dest: '', cause: '', pay: '',
      dept: info.ddept, reg: info.dreg, city: info.loc, pc: info.dpc, ref,
      civ: info.civ, fn: info.fn, ln: info.ln,
      nm: `${info.fn} ${info.ln}`.trim() || info.ln,
      email: info.email, phone: info.phone, addr: info.addr,
      loc: info.loc, dpc: info.dpc, ctry: info.ctry,
      ltv: info.ltv, rPost: info.rPost, rTel: info.rTel, rEmail: info.rEmail,
      pcat: info.pcat, act: info.act, tier: info.tier, genre: info.genre, type: info.type,
      ddept: info.ddept, dreg: info.dreg, matched: 1,
    });
  }

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      rows: records.length,
      txTotalBase: Math.round((txTotalBase + Number.EPSILON) * 100) / 100,
    },
    records,
  };
}
