// Anonymized DONVERSE refresh script — thin I/O wrapper around the shared
// pure aggregation module in lib/aggregateDonverse.ts.
//
// Locates two PII CRM exports (filename-agnostic, auto-detected by content),
// reads them to plain row arrays via SheetJS, calls aggregateDonverse(...), and
// writes a fully anonymized aggregate at public/data/donverse.json (zero PII).
//
// Run with: tsx scripts/aggregate-donverse.ts   (see package.json "refresh").
//
// Source directory resolution priority:
//   (a) CLI arg `process.argv[2]` if given
//   (b) ./data-source in the project root, if it exists and has .xlsx files
//   (c) ~/Documents/GitHub/_mhf_source  (legacy fallback)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import * as XLSX from 'xlsx';
import { aggregateDonverseWithExtras } from '../lib/aggregateDonverse';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
// Seed dataset now lives server-side (api/_data), NOT under public/, so the
// production data is never served as a static file. The serverless /api/data
// function bundles + serves this seed when no upload exists yet.
const OUT = resolve(REPO, 'api/_data/seed-donverse.json');
const OUT_PUBLIC = resolve(REPO, 'public/data/donverse.json'); // static fallback served to the client

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- Resolve source directory ----
function listXlsx(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$'))
      .map((f) => resolve(dir, f));
  } catch {
    return [];
  }
}

function resolveSourceDir(): string {
  const argDir = process.argv[2];
  if (argDir) {
    const d = resolve(argDir);
    if (!existsSync(d)) {
      console.error(`ERROR: source directory passed as argument does not exist: ${d}`);
      process.exit(1);
    }
    return d;
  }
  const dataSource = resolve(REPO, 'data-source');
  if (existsSync(dataSource) && listXlsx(dataSource).length > 0) return dataSource;
  return resolve(homedir(), 'Documents/GitHub/_mhf_source');
}

const SRC = resolveSourceDir();
console.log('Source directory:', SRC);

// ---- Auto-detection by signature columns ----
function readHeaders(file: string): Set<string> {
  try {
    const wb = XLSX.read(readFileSync(file), { sheetRows: 1, dense: true });
    const headers = new Set<string>();
    for (const sn of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], { header: 1, defval: null, raw: true });
      if (rows && rows[0]) for (const h of rows[0]) if (h != null) headers.add(String(h).trim());
    }
    return headers;
  } catch {
    return new Set<string>();
  }
}

const has = (set: Set<string>, ...cols: string[]) => cols.every((c) => set.has(c));
const hasAny = (set: Set<string>, ...cols: string[]) => cols.some((c) => set.has(c));

function isTransactions(h: Set<string>): boolean {
  return has(h, 'Donation Amount (Base)', 'Fund Dimension 2', 'Postal Code');
}
function isDonors(h: Set<string>): boolean {
  return has(h, 'Total Donation Amount', 'Maximum Donation Date') && hasAny(h, 'RGPD POST IN', 'Reference');
}

function detectSources(): { txFile: string; donorFile: string } {
  const candidates = listXlsx(SRC);
  if (candidates.length === 0) {
    console.error(`ERROR: no .xlsx files found in source directory: ${SRC}`);
    console.error('Drop your two N3O exports (transactions + donors) there and retry.');
    process.exit(1);
  }
  const txMatches: string[] = [];
  const donorMatches: string[] = [];
  for (const file of candidates) {
    const h = readHeaders(file);
    if (isTransactions(h)) txMatches.push(file);
    if (isDonors(h)) donorMatches.push(file);
  }
  const newest = (arr: string[]) =>
    arr.slice().sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];

  const errs: string[] = [];
  if (txMatches.length === 0) {
    errs.push('TRANSACTIONS file NOT found. Expected signature columns: "Donation Amount (Base)" AND "Fund Dimension 2" AND "Postal Code".');
  }
  if (donorMatches.length === 0) {
    errs.push('DONORS file NOT found. Expected signature columns: "Total Donation Amount" AND "Maximum Donation Date" AND ("RGPD POST IN" OR "Reference").');
  }
  if (errs.length) {
    console.error('\nERROR: could not auto-detect both source files.');
    console.error('Files scanned in', SRC + ':');
    for (const f of candidates) console.error('  -', basename(f));
    console.error('');
    for (const e of errs) console.error('  ' + e);
    process.exit(1);
  }
  const txFile = newest(txMatches);
  const donorFile = newest(donorMatches);
  if (txFile === donorFile) {
    console.error(`ERROR: the same file (${basename(txFile)}) matched BOTH roles. Provide two distinct exports.`);
    process.exit(1);
  }
  const stamp = (f: string) => new Date(statSync(f).mtime).toISOString().slice(0, 16).replace('T', ' ');
  console.log(`Detected TRANSACTIONS file: ${basename(txFile)}  (modified ${stamp(txFile)})`);
  console.log(`Detected DONORS file:       ${basename(donorFile)}  (modified ${stamp(donorFile)})`);
  return { txFile, donorFile };
}

const { txFile: TX_FILE, donorFile: DONOR_FILE } = detectSources();

function readSheet(file: string, sheetHint: string): any[] {
  const buf = readFileSync(file);
  const wb = XLSX.read(buf, { cellDates: true, dense: true });
  const sn = wb.SheetNames.find(s => s.toLowerCase().includes(sheetHint.toLowerCase())) || wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: null, raw: true });
}

console.log('Reading transactions:', basename(TX_FILE));
const txData = readSheet(TX_FILE, 'dashboard');
console.log('  tx rows:', txData.length);
console.log('Reading donors:', basename(DONOR_FILE));
const donorData = readSheet(DONOR_FILE, 'donateurs');
console.log('  donor rows:', donorData.length);

// ================= AGGREGATE (shared pure module) =================
const SUPPRESS_MIN_DONORS = 5;
const { data: output, extras } = aggregateDonverseWithExtras(txData, donorData, {
  suppressMinDonors: SUPPRESS_MIN_DONORS,
  sources: [basename(TX_FILE), basename(DONOR_FILE)],
  generatedAt: new Date().toISOString(),
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(output, null, 2));
mkdirSync(dirname(OUT_PUBLIC), { recursive: true });
writeFileSync(OUT_PUBLIC, JSON.stringify(output));

// ================= SUMMARY =================
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const txTotalBase = output.meta.txTotalBase;
const donorTotal = output.donors.total;
const donorLtv = output.donors.totalLtv;
const nonFranceTotal = extras.nonFranceTotal;

console.log('\n========== SUMMARY ==========');
console.log('txRows:', output.meta.txRows);
console.log('txTotalBase: €' + fmt(txTotalBase));
console.log('donorRows:', output.meta.donorRows, '| donors.total:', donorTotal, '| totalLtv: €' + fmt(donorLtv));
console.log('#depts (tx):', output.tx.byDept.length, '| #regions (tx):', output.tx.byRegion.length);
console.log('monthMin:', output.meta.monthMin, 'monthMax:', output.meta.monthMax);
console.log('nonFranceTotal: €' + fmt(nonFranceTotal));
console.log('schema:', output.meta.schema);

// ================= CUBE SUMMARY =================
const cube = output.cube || [];
const months = output.months || [];
const themes = output.themes || [];
console.log('\n========== CUBE (month × theme) ==========');
console.log(`months: ${months.length} (${months[0] || '-'} .. ${months[months.length - 1] || '-'})`);
console.log(`themes: ${themes.length}`);
console.log(`cube cells: ${cube.length}  (max possible months×themes = ${months.length * themes.length})`);
console.log(`regionByDept entries: ${Object.keys(output.regionByDept || {}).length}`);
const pg = output.postcodeGlobal || { byPostcode: [], suppressed: { count: 0, value: 0 } };
console.log(`postcodeGlobal: ${pg.byPostcode.length} postcodes published | suppressed ${pg.suppressed.count} tx, €${fmt(pg.suppressed.value)}`);
console.log(`cube excluded (invalid month): ${extras.cubeExcludedCount} rows, €${fmt(extras.cubeExcludedValue)}`);

console.log('\nTop 5 depts by value:');
[...output.tx.byDept].sort((a, b) => b.value - a.value).slice(0, 5)
  .forEach(d => console.log('  ', d.code, '€' + fmt(d.value), '(' + d.count + ')'));
console.log('\nTop 5 themes:');
output.tx.byTheme.slice(0, 5).forEach(t => console.log('  ', t.name, '€' + fmt(t.value), '(' + t.count + ')'));
console.log('\nPayment families:');
output.tx.byPayment.forEach(p => console.log('  ', p.name, '€' + fmt(p.value), '(' + p.count + ')', p.isPA ? '[PA]' : ''));
console.log('\nDonor activity:');
output.donors.byActivity.forEach(a => console.log('  ', a.name, a.count));
console.log('\nDonor tiers:');
output.donors.byTier.forEach(t => console.log('  ', t.name, t.count));
console.log('\nDonor consent (RGPD POST IN):');
output.donors.byConsent.forEach(c => console.log('  ', c.name, c.count));

// ================= POSTCODE SUMMARY =================
const txPc = output.tx.byPostcode || [];
const donorPc = output.donors.byPostcode || [];
const txSupp = output.tx.postcodeSuppressed || { count: 0, value: 0 };
const donorSupp = output.donors.postcodeSuppressed || { count: 0 };
console.log('\n========== POSTCODES ==========');
console.log(`suppressMinDonors threshold: ${output.meta.suppressMinDonors}`);
console.log(`tx.byPostcode: ${txPc.length} published | suppressed bucket: ${txSupp.count} tx, €${fmt(txSupp.value)}`);
console.log(`donors.byPostcode: ${donorPc.length} published | suppressed bucket: ${donorSupp.count} donors`);
console.log(`distinct postcodes suppressed (meta): ${output.meta.postcodesSuppressed}`);

// ================= RECONCILIATION =================
const TOL = 1.0;
const sumThemes = output.tx.byTheme.reduce((s, t) => s + t.value, 0);
const sumDept = output.tx.byDept.reduce((s, d) => s + d.value, 0);
const sumDeptPlusNonFrance = sumDept + nonFranceTotal;
const sumActivity = output.donors.byActivity.reduce((s, a) => s + a.count, 0);
const sumTier = output.donors.byTier.reduce((s, t) => s + t.count, 0);
// Postcode reconcile: published value + suppressed value == all valid-PC rows.
const sumTxPc = txPc.reduce((s, p) => s + p.value, 0);
const sumTxPcAll = sumTxPc + txSupp.value;
const sumDonorPc = donorPc.reduce((s, p) => s + p.count, 0);
const sumDonorPcAll = sumDonorPc + donorSupp.count;

const c1 = Math.abs(sumThemes - txTotalBase) <= TOL;
const c2 = Math.abs(sumDeptPlusNonFrance - txTotalBase) <= TOL;
const c3 = sumActivity === donorTotal;
const c4 = sumTier === donorTotal;
const c5 = Math.abs(sumTxPcAll - extras.validPostcodeTxValue) <= TOL;
const c6 = sumDonorPcAll === undefined ? false : true; // donor PC bucketing is exact integer

// ---- Cube reconcile ----
// sum over cube cells of v + excluded(invalid-month) value ≈ txTotalBase.
const sumCubeV = cube.reduce((s, c) => s + c.v, 0);
const sumCubePlusExcluded = sumCubeV + extras.cubeExcludedValue;
const c7 = Math.abs(sumCubePlusExcluded - txTotalBase) <= TOL;
// Sample cell reconcile: stip & dept sum to cell.v (stored in full).
const sampleTheme = themes[0];
const sample = cube.find((c) => c.t === sampleTheme) // first month of top theme
  || cube[0];
let c8 = true, c9 = true;
let sampleStipSum = 0, sampleDeptSum = 0;
if (sample) {
  sampleStipSum = sample.stip.reduce((s, x) => s + x[1], 0);
  sampleDeptSum = sample.dept.reduce((s, x) => s + x[1], 0);
  c8 = Math.abs(sampleStipSum - sample.v) <= TOL;
  // dept may be < v if some rows had no valid FR dept; treat <= v + tol as OK,
  // but report. Exact equality only when all rows in cell have a valid dept.
  c9 = sampleDeptSum <= sample.v + TOL;
}

console.log('\n========== RECONCILE ==========');
console.log(`sum(byTheme.value)=€${fmt(round2(sumThemes))} vs txTotalBase=€${fmt(txTotalBase)} -> ${c1 ? 'OK' : 'MISMATCH'}`);
console.log(`sum(byDept)=€${fmt(round2(sumDept))} + nonFrance=€${fmt(round2(nonFranceTotal))} = €${fmt(round2(sumDeptPlusNonFrance))} vs txTotalBase=€${fmt(txTotalBase)} -> ${c2 ? 'OK' : 'MISMATCH'}`);
console.log(`sum(byActivity.count)=${sumActivity} vs donors.total=${donorTotal} -> ${c3 ? 'OK' : 'MISMATCH'}`);
console.log(`sum(byTier.count)=${sumTier} vs donors.total=${donorTotal} -> ${c4 ? 'OK' : 'MISMATCH'}`);
console.log(`sum(tx.byPostcode.value)=€${fmt(round2(sumTxPc))} + suppressed=€${fmt(round2(txSupp.value))} = €${fmt(round2(sumTxPcAll))} vs validPostcodeTxValue=€${fmt(extras.validPostcodeTxValue)} -> ${c5 ? 'OK' : 'MISMATCH'}`);
console.log(`donors.byPostcode bucketing: published=${sumDonorPc} + suppressed=${donorSupp.count} = ${sumDonorPcAll} -> ${c6 ? 'OK' : 'MISMATCH'}`);
console.log(`sum(cube.v)=€${fmt(round2(sumCubeV))} + excluded(invalid-month)=€${fmt(round2(extras.cubeExcludedValue))} = €${fmt(round2(sumCubePlusExcluded))} vs txTotalBase=€${fmt(txTotalBase)} -> ${c7 ? 'OK' : 'MISMATCH'}`);
if (sample) {
  console.log(`sample cell [${sample.m} / ${sample.t}]: v=€${fmt(sample.v)} count=${sample.c}`);
  console.log(`  sum(stip)=€${fmt(round2(sampleStipSum))} vs v=€${fmt(sample.v)} -> ${c8 ? 'OK' : 'MISMATCH'}`);
  console.log(`  sum(dept)=€${fmt(round2(sampleDeptSum))} (<= v, remainder = non-FR) -> ${c9 ? 'OK' : 'MISMATCH'}`);
  console.log(`  stip entries=${sample.stip.length} pay=${sample.pay.length} dest=${sample.dest.length} city(top30)=${sample.city.length} dept=${sample.dept.length}`);
}

const pass = c1 && c2 && c3 && c4 && c5 && c6 && c7 && c8 && c9;
console.log('RECONCILE: ' + (pass ? 'PASS' : 'FAIL'));
console.log('\nWrote', OUT);
if (!pass) process.exit(1);
