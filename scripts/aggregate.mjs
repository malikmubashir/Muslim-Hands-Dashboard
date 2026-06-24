// scripts/aggregate.mjs
// Phase 1 static aggregation pipeline.
// Streams the raw donations CSV (~60MB) and emits an anonymized, pre-aggregated
// JSON (public/data/aggregates.json) keyed by month (YYYY-MM).
//
// Usage: node scripts/aggregate.mjs [csvPath]
//   default csvPath = /Users/mmh/Documents/GitHub/MHF-HTML-Dashboard/Book2.csv
//
// PII NOTE: only the analytical dimensions + amount + month are emitted.
// Account names, references, addresses, postal codes, sponsoree IDs, etc. are
// NEVER read into the output.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CSV = '/Users/mmh/Documents/GitHub/MHF-HTML-Dashboard/Book2.csv';
const csvPath = process.argv[2] || DEFAULT_CSV;
const outPath = path.resolve(__dirname, '..', 'public', 'data', 'aggregates.json');

// ---- helpers ----------------------------------------------------------------

// Parse DD/MM/YYYY (2-digit years -> 20xx). Returns "YYYY-MM" or null if invalid.
function monthKeyFromDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split('/');
  if (parts.length !== 3) return null;
  let [day, month, year] = parts;
  if (year.length === 2) year = '20' + year;
  const d = new Date(`${year}-${month}-${day}`);
  if (isNaN(d.getTime())) return null;
  // Re-derive month key from the components (avoid TZ surprises).
  const mm = String(month).padStart(2, '0');
  if (!/^\d{4}$/.test(year) || Number(mm) < 1 || Number(mm) > 12) return null;
  return `${year}-${mm}`;
}

// Per-dimension empty-value fallbacks, matching the client exactly.
function themeVal(v) { return (v && v.trim()) ? v : 'Non spécifié'; }
function typeVal(v) { return (v && v.trim()) ? v : 'Non spécifié'; }
function projectVal(v) { return (v && v.trim()) ? v : 'Non spécifié'; }
function incomeVal(v) { return (v && v.trim()) ? v : 'Inconnu'; }
function regionVal(v) { return (v && v.trim()) ? v : 'Inconnu'; }
function countryVal(v) {
  if (!v || v === '' || v === 'undefined') return 'Global';
  return v;
}

// nested accumulate: map(month) -> map(name) -> {amount,count}
function bump(dimMap, month, name, amount) {
  let m = dimMap.get(month);
  if (!m) { m = new Map(); dimMap.set(month, m); }
  let e = m.get(name);
  if (!e) { e = { amount: 0, count: 0 }; m.set(name, e); }
  e.amount += amount;
  e.count += 1;
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- accumulators -----------------------------------------------------------

const dims = {
  theme: new Map(),
  type: new Map(),
  project: new Map(),
  incomeType: new Map(),
  country: new Map(),
  region: new Map(),
};
// themeProject: month -> theme -> project -> {amount,count}
const themeProject = new Map();
const monthsSet = new Set();

let rowCount = 0;          // kept rows
let skippedInvalidDate = 0;
let grandTotalAmount = 0;
let grandTotalCount = 0;

function tpBump(month, theme, project, amount) {
  let mt = themeProject.get(month);
  if (!mt) { mt = new Map(); themeProject.set(month, mt); }
  let pt = mt.get(theme);
  if (!pt) { pt = new Map(); mt.set(theme, pt); }
  let e = pt.get(project);
  if (!e) { e = { amount: 0, count: 0 }; pt.set(project, e); }
  e.amount += amount;
  e.count += 1;
}

function handleRow(row) {
  const month = monthKeyFromDate(row['Donation Date']);
  if (!month) { skippedInvalidDate += 1; return; }

  let amount = parseFloat(row['Amount'] || '0');
  if (isNaN(amount)) amount = 0;

  const theme = themeVal(row['Thème']);
  const type = typeVal(row['Requête']);
  const project = projectVal(row['Allocation Summary']);
  const income = incomeVal(row['Income Type']);
  const country = countryVal(row['Localité']);
  const region = regionVal(row['Account Postal Region']);

  bump(dims.theme, month, theme, amount);
  bump(dims.type, month, type, amount);
  bump(dims.project, month, project, amount);
  bump(dims.incomeType, month, income, amount);
  bump(dims.country, month, country, amount);
  bump(dims.region, month, region, amount);
  tpBump(month, theme, project, amount);

  monthsSet.add(month);
  rowCount += 1;
  grandTotalAmount += amount;
  grandTotalCount += 1;
}

// ---- serialization ----------------------------------------------------------

function flattenDim(dimMap) {
  const out = [];
  for (const [month, names] of dimMap) {
    for (const [name, e] of names) {
      out.push({ month, name, value: round2(e.amount), count: e.count });
    }
  }
  return out;
}

function flattenThemeProject() {
  const out = [];
  for (const [month, themes] of themeProject) {
    for (const [theme, projects] of themes) {
      for (const [name, e] of projects) {
        out.push({ month, theme, name, value: round2(e.amount), count: e.count });
      }
    }
  }
  return out;
}

function buildOutput() {
  const months = [...monthsSet].sort();
  const monthMin = months[0] || '';
  const monthMax = months[months.length - 1] || '';
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'Book2.csv',
      rowCount,
      skippedInvalidDate,
      grandTotalAmount: round2(grandTotalAmount),
      grandTotalCount,
      monthMin,
      monthMax,
    },
    dims: {
      theme: flattenDim(dims.theme),
      type: flattenDim(dims.type),
      project: flattenDim(dims.project),
      incomeType: flattenDim(dims.incomeType),
      country: flattenDim(dims.country),
      region: flattenDim(dims.region),
    },
    themeProject: flattenThemeProject(),
  };
}

// ---- reconciliation + summary ----------------------------------------------

function reconcileAndReport(output) {
  const themeAmount = output.dims.theme.reduce((a, b) => a + b.value, 0);
  const themeCount = output.dims.theme.reduce((a, b) => a + b.count, 0);
  const tpAmount = output.themeProject.reduce((a, b) => a + b.value, 0);

  const tol = 0.5;
  const grand = output.meta.grandTotalAmount;
  const okThemeAmt = Math.abs(themeAmount - grand) <= tol;
  const okThemeCnt = themeCount === output.meta.grandTotalCount;
  const okTpAmt = Math.abs(tpAmount - grand) <= tol;
  const pass = okThemeAmt && okThemeCnt && okTpAmt;

  if (pass) {
    console.log('RECONCILE: PASS');
  } else {
    console.log('RECONCILE: FAIL ' + JSON.stringify({
      grand, themeAmount: round2(themeAmount), themeCount,
      grandCount: output.meta.grandTotalCount, tpAmount: round2(tpAmount),
      okThemeAmt, okThemeCnt, okTpAmt,
    }));
  }
  return pass;
}

function printSummary(output, fileSize) {
  const m = output.meta;
  console.log('--- aggregate summary ---');
  console.log('kept rowCount      :', m.rowCount);
  console.log('skippedInvalidDate :', m.skippedInvalidDate);
  console.log('grandTotalAmount   :', m.grandTotalAmount);
  console.log('grandTotalCount    :', m.grandTotalCount);
  console.log('#months            :', monthsSet.size);
  console.log('month range        :', m.monthMin, '..', m.monthMax);
  console.log('output file        :', outPath);
  console.log('output size        :', (fileSize / 1024).toFixed(1) + ' KB');

  // Top 5 themes by amount (across all months)
  const themeTotals = new Map();
  for (const r of output.dims.theme) {
    themeTotals.set(r.name, (themeTotals.get(r.name) || 0) + r.value);
  }
  const top5 = [...themeTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('top 5 themes by amount:');
  for (const [name, amt] of top5) console.log('  ', name, '=', round2(amt));
}

// ---- main -------------------------------------------------------------------

function main() {
  if (!fs.existsSync(csvPath)) {
    console.error('CSV not found:', csvPath);
    process.exit(1);
  }
  console.log('Reading CSV:', csvPath);

  const stream = fs.createReadStream(csvPath, { encoding: 'utf8' });

  Papa.parse(stream, {
    header: true,
    skipEmptyLines: true,
    step: (results) => {
      handleRow(results.data);
    },
    complete: () => {
      const output = buildOutput();
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(output));
      const fileSize = fs.statSync(outPath).size;

      printSummary(output, fileSize);
      const pass = reconcileAndReport(output);
      process.exit(pass ? 0 : 1);
    },
    error: (err) => {
      console.error('Parse error:', err);
      process.exit(1);
    },
  });
}

main();
