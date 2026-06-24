// Anonymized DONVERSE aggregation pipeline.
// Reads two PII CRM exports from ~/Documents/GitHub/_mhf_source and writes a
// fully anonymized aggregate at public/data/donverse.json (zero personal data).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import * as XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const SRC = resolve(homedir(), 'Documents/GitHub/_mhf_source');
const TX_FILE = 'DASHBOARD DATA - 2025.xlsx';
const DONOR_FILE = 'Liste donateurs global.xlsx';
const OUT = resolve(REPO, 'public/data/donverse.json');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- Département -> Région (names match regions.geojson `nom` exactly) ----
const DEPT_TO_REGION = {};
const REGION_DEPTS = {
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
  // DOM (not present in metropolitan regions.geojson; kept for data completeness)
  'Guadeloupe': ['971'],
  'Martinique': ['972'],
  'Guyane': ['973'],
  'La Réunion': ['974'],
  'Mayotte': ['976'],
};
for (const [region, depts] of Object.entries(REGION_DEPTS)) {
  for (const d of depts) DEPT_TO_REGION[d] = region;
}
const VALID_DEPTS = new Set(Object.keys(DEPT_TO_REGION));

// ---- Normalization helpers ----
const THEME_MAP = { 'Fonds general': 'Fonds général', 'Environement': 'Environnement' };
const STIP_MAP = { 'Zakat El MAal': 'Zakat El Maal' };

function normTheme(v) {
  const t = (v == null ? '' : String(v)).trim();
  if (t === '') return 'Non spécifié';
  return THEME_MAP[t] || t;
}
function normStip(v) {
  const t = (v == null ? '' : String(v)).trim();
  if (t === '') return 'Non spécifié';
  return STIP_MAP[t] || t;
}
function normPayment(v) {
  const raw = (v == null ? '' : String(v));
  const t = raw.split(' - ')[0].trim();
  return t === '' ? 'Non spécifié' : t;
}
function normSimple(v) {
  const t = (v == null ? '' : String(v)).trim();
  return t === '' ? 'Non spécifié' : t;
}

// Department code from a postal code. Returns null if not a valid France dept.
function deptFromPostal(pc) {
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

function toMonth(d) {
  if (d == null) return null;
  let dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function yearOf(d) {
  if (d == null) return null;
  let dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.getUTCFullYear();
}
function num(v) {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ---- Generic accumulator: name/code -> {value,count, ...extra} ----
function addSlice(map, key, value, extra) {
  let e = map.get(key);
  if (!e) { e = { value: 0, count: 0, ...(extra || {}) }; map.set(key, e); }
  e.value += value;
  e.count += 1;
  return e;
}
function sortDesc(arr) { return arr.sort((a, b) => b.value - a.value); }

function readSheet(file, sheetHint) {
  const buf = readFileSync(resolve(SRC, file));
  const wb = XLSX.read(buf, { cellDates: true, dense: true });
  const sn = wb.SheetNames.find(s => s.toLowerCase().includes(sheetHint.toLowerCase())) || wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: null, raw: true });
}

console.log('Reading transactions:', TX_FILE);
const txData = readSheet(TX_FILE, 'dashboard');
console.log('  tx rows:', txData.length);
console.log('Reading donors:', DONOR_FILE);
const donorData = readSheet(DONOR_FILE, 'donateurs');
console.log('  donor rows:', donorData.length);

// ================= TRANSACTIONS =================
const byDept = new Map();      // code -> {value,count}
const byRegion = new Map();    // name -> {value,count}
const byTheme = new Map();
const byStipulation = new Map();
const byPayment = new Map();    // name -> {value,count,isPA}
const byDestination = new Map();
const byMonth = new Map();      // month -> {amount,count}
const byCountry = new Map();    // name -> {value,count}

let txTotalBase = 0;
let nonFranceTotal = 0;        // base amount for rows with no valid France dept
let monthMin = null, monthMax = null;

for (const r of txData) {
  const amount = num(r['Donation Amount (Base)']);
  txTotalBase += amount;

  const theme = normTheme(r['Fund Dimension 2']);
  const stip = normStip(r['Fund Dimension 3']);
  const dest = normSimple(r['Fund Dimension 1']);
  const payment = normPayment(r['Payment Method']);
  const isPA = payment === 'Direct Debit';
  const country = normSimple(r['Address Country']);
  const dept = deptFromPostal(r['Postal Code']);
  const month = toMonth(r['Date']);

  addSlice(byTheme, theme, amount);
  addSlice(byStipulation, stip, amount);
  addSlice(byPayment, payment, amount, { isPA }).isPA = isPA;
  addSlice(byDestination, dest, amount);
  addSlice(byCountry, country, amount);

  if (dept && VALID_DEPTS.has(dept)) {
    addSlice(byDept, dept, amount);
    addSlice(byRegion, DEPT_TO_REGION[dept], amount);
  } else {
    nonFranceTotal += amount;
  }

  if (month) {
    let m = byMonth.get(month);
    if (!m) { m = { amount: 0, count: 0 }; byMonth.set(month, m); }
    m.amount += amount; m.count += 1;
    if (monthMin === null || month < monthMin) monthMin = month;
    if (monthMax === null || month > monthMax) monthMax = month;
  }
}

// ================= DONORS =================
function activityName(maxDate) {
  const y = yearOf(maxDate);
  if (y == null) return 'Inconnu';
  if (y >= 2024) return 'Actif (2024+)';
  if (y >= 2021) return 'Inactif (2021-23)';
  return 'Oublié (<2021)';
}
function tierName(ltv) {
  if (ltv >= 5000) return 'Major (≥5k)';
  if (ltv >= 1500) return 'Generous (1.5-5k)';
  if (ltv >= 500) return 'Engaged (500-1.5k)';
  return 'Kind (<500)';
}

const dByActivity = new Map();
const dByTier = new Map();
const dByType = new Map();
const dByConsent = new Map();
const dByDept = new Map();    // code -> {count,active,ltv}
const dByRegion = new Map();  // name -> {count,active,ltv}

let donorTotal = 0;
let donorLtv = 0;

const inc = (map, key) => { map.set(key, (map.get(key) || 0) + 1); };

for (const r of donorData) {
  donorTotal += 1;
  const ltv = num(r['Total Donation Amount']);
  donorLtv += ltv;
  const maxDate = r['Maximum Donation Date'];
  const isActive = (yearOf(maxDate) || 0) >= 2024;

  inc(dByActivity, activityName(maxDate));
  inc(dByTier, tierName(ltv));
  inc(dByType, normSimple(r['Type']));
  const consentRaw = (r['RGPD POST IN'] == null ? '' : String(r['RGPD POST IN'])).trim();
  inc(dByConsent, consentRaw === '' ? 'Non renseigné' : consentRaw);

  const dept = deptFromPostal(r['Postal Code']);
  if (dept && VALID_DEPTS.has(dept)) {
    let e = dByDept.get(dept);
    if (!e) { e = { count: 0, active: 0, ltv: 0 }; dByDept.set(dept, e); }
    e.count += 1; if (isActive) e.active += 1; e.ltv += ltv;
    const region = DEPT_TO_REGION[dept];
    let re = dByRegion.get(region);
    if (!re) { re = { count: 0, active: 0, ltv: 0 }; dByRegion.set(region, re); }
    re.count += 1; if (isActive) re.active += 1; re.ltv += ltv;
  }
}

// ================= ASSEMBLE OUTPUT =================
const txByDept = [...byDept.entries()].map(([code, e]) => ({ code, value: round2(e.value), count: e.count }))
  .sort((a, b) => a.code.localeCompare(b.code));
const txByRegion = sortDesc([...byRegion.entries()].map(([name, e]) => ({ name, value: round2(e.value), count: e.count })));
const txByTheme = sortDesc([...byTheme.entries()].map(([name, e]) => ({ name, value: round2(e.value), count: e.count })));
const txByStip = sortDesc([...byStipulation.entries()].map(([name, e]) => ({ name, value: round2(e.value), count: e.count })));
const txByPayment = sortDesc([...byPayment.entries()].map(([name, e]) => ({ name, value: round2(e.value), count: e.count, isPA: !!e.isPA })));
const txByDest = sortDesc([...byDestination.entries()].map(([name, e]) => ({ name, value: round2(e.value), count: e.count })));
const txByMonth = [...byMonth.entries()].map(([month, e]) => ({ month, amount: round2(e.amount), count: e.count }))
  .sort((a, b) => a.month.localeCompare(b.month));
const txByCountry = sortDesc([...byCountry.entries()].map(([name, e]) => ({ name, value: round2(e.value), count: e.count })));

// Donor ordered category lists (fixed display order)
const ACT_ORDER = ['Actif (2024+)', 'Inactif (2021-23)', 'Oublié (<2021)', 'Inconnu'];
const TIER_ORDER = ['Kind (<500)', 'Engaged (500-1.5k)', 'Generous (1.5-5k)', 'Major (≥5k)'];
const dByActivityArr = ACT_ORDER.map(name => ({ name, count: dByActivity.get(name) || 0 }));
const dByTierArr = TIER_ORDER.map(name => ({ name, count: dByTier.get(name) || 0 }));
const dByTypeArr = [...dByType.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
const dByConsentArr = [...dByConsent.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
const dByDeptArr = [...dByDept.entries()].map(([code, e]) => ({ code, count: e.count, active: e.active, ltv: round2(e.ltv) }))
  .sort((a, b) => a.code.localeCompare(b.code));
const dByRegionArr = [...dByRegion.entries()].map(([name, e]) => ({ name, count: e.count, active: e.active, ltv: round2(e.ltv) }))
  .sort((a, b) => b.count - a.count);

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    sources: [TX_FILE, DONOR_FILE],
    currency: 'EUR',
    txRows: txData.length,
    txTotalBase: round2(txTotalBase),
    donorRows: donorData.length,
    monthMin,
    monthMax,
    note: 'Region names match regions.geojson `nom` exactly (13 metropolitan regions). DOM departments (971-976) and their regions appear in the data slices for completeness but have NO polygon in the metropolitan france-geojson, so they will not render on the choropleth map.',
  },
  tx: {
    byDept: txByDept,
    byRegion: txByRegion,
    byTheme: txByTheme,
    byStipulation: txByStip,
    byPayment: txByPayment,
    byDestination: txByDest,
    byMonth: txByMonth,
    byCountry: txByCountry,
  },
  donors: {
    total: donorTotal,
    totalLtv: round2(donorLtv),
    byActivity: dByActivityArr,
    byTier: dByTierArr,
    byType: dByTypeArr,
    byConsent: dByConsentArr,
    byDept: dByDeptArr,
    byRegion: dByRegionArr,
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(output, null, 2));

// ================= SUMMARY =================
const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
console.log('\n========== SUMMARY ==========');
console.log('txRows:', txData.length);
console.log('txTotalBase: €' + fmt(round2(txTotalBase)));
console.log('donorRows:', donorData.length, '| donors.total:', donorTotal, '| totalLtv: €' + fmt(round2(donorLtv)));
console.log('#depts (tx):', txByDept.length, '| #regions (tx):', txByRegion.length);
console.log('monthMin:', monthMin, 'monthMax:', monthMax);
console.log('nonFranceTotal: €' + fmt(round2(nonFranceTotal)));

console.log('\nTop 5 depts by value:');
[...txByDept].sort((a, b) => b.value - a.value).slice(0, 5)
  .forEach(d => console.log('  ', d.code, '€' + fmt(d.value), '(' + d.count + ')'));
console.log('\nTop 5 themes:');
txByTheme.slice(0, 5).forEach(t => console.log('  ', t.name, '€' + fmt(t.value), '(' + t.count + ')'));
console.log('\nPayment families:');
txByPayment.forEach(p => console.log('  ', p.name, '€' + fmt(p.value), '(' + p.count + ')', p.isPA ? '[PA]' : ''));
console.log('\nDonor activity:');
dByActivityArr.forEach(a => console.log('  ', a.name, a.count));
console.log('\nDonor tiers:');
dByTierArr.forEach(t => console.log('  ', t.name, t.count));
console.log('\nDonor consent (RGPD POST IN):');
dByConsentArr.forEach(c => console.log('  ', c.name, c.count));

// ================= RECONCILIATION =================
const TOL = 1.0;
const sumThemes = txByTheme.reduce((s, t) => s + t.value, 0);
const sumDept = txByDept.reduce((s, d) => s + d.value, 0);
const sumDeptPlusNonFrance = sumDept + nonFranceTotal;
const sumActivity = dByActivityArr.reduce((s, a) => s + a.count, 0);
const sumTier = dByTierArr.reduce((s, t) => s + t.count, 0);

const c1 = Math.abs(sumThemes - txTotalBase) <= TOL;
const c2 = Math.abs(sumDeptPlusNonFrance - txTotalBase) <= TOL;
const c3 = sumActivity === donorTotal;
const c4 = sumTier === donorTotal;

console.log('\n========== RECONCILE ==========');
console.log(`sum(byTheme.value)=€${fmt(round2(sumThemes))} vs txTotalBase=€${fmt(round2(txTotalBase))} -> ${c1 ? 'OK' : 'MISMATCH'}`);
console.log(`sum(byDept)=€${fmt(round2(sumDept))} + nonFrance=€${fmt(round2(nonFranceTotal))} = €${fmt(round2(sumDeptPlusNonFrance))} vs txTotalBase=€${fmt(round2(txTotalBase))} -> ${c2 ? 'OK' : 'MISMATCH'}`);
console.log(`sum(byActivity.count)=${sumActivity} vs donors.total=${donorTotal} -> ${c3 ? 'OK' : 'MISMATCH'}`);
console.log(`sum(byTier.count)=${sumTier} vs donors.total=${donorTotal} -> ${c4 ? 'OK' : 'MISMATCH'}`);
const pass = c1 && c2 && c3 && c4;
console.log('RECONCILE: ' + (pass ? 'PASS' : 'FAIL'));
console.log('\nWrote', OUT);
if (!pass) process.exit(1);
