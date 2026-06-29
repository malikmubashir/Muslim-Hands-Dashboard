// DEV-ONLY: build a PLAINTEXT extraction dataset for local testing.
//
// Reads the two N3O exports from ./data-source, calls the pure
// buildExtractionData(...) builder, and writes the result UNENCRYPTED to
// public/data/extraction-dev.json so the Extraction tab works on the plain
// `vite` dev server (which has no /api/extract function and no ciphertext).
//
// SECURITY: the output contains contact PII. It is gitignored and must NEVER
// be committed or deployed. Production uses the encrypted /api/extract path.
//
// Run: npx tsx scripts/extract-dev.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { buildExtractionData } from '../lib/buildExtractionData';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const SRC = resolve(REPO, 'data-source');
const OUT = resolve(REPO, 'public/data/extraction-dev.json');

function listXlsx(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$'))
      .map((f) => resolve(dir, f));
  } catch { return []; }
}
function readHeaders(file: string): Set<string> {
  try {
    const wb = XLSX.read(readFileSync(file), { sheetRows: 1, dense: true });
    const headers = new Set<string>();
    for (const sn of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], { header: 1, defval: null, raw: true });
      if (rows && rows[0]) for (const h of rows[0]) if (h != null) headers.add(String(h).trim());
    }
    return headers;
  } catch { return new Set<string>(); }
}
const has = (s: Set<string>, ...c: string[]) => c.every((x) => s.has(x));
const hasAny = (s: Set<string>, ...c: string[]) => c.some((x) => s.has(x));
const isTx = (h: Set<string>) => has(h, 'Donation Amount (Base)', 'Fund Dimension 2', 'Postal Code');
const isDonor = (h: Set<string>) => has(h, 'Total Donation Amount', 'Maximum Donation Date') && hasAny(h, 'RGPD POST IN', 'Reference');

function readSheet(file: string, hint: string): any[] {
  const wb = XLSX.read(readFileSync(file), { cellDates: true, dense: true });
  const sn = wb.SheetNames.find((s) => s.toLowerCase().includes(hint.toLowerCase())) || wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: null, raw: true });
}

if (!existsSync(SRC) || listXlsx(SRC).length === 0) {
  console.error('ERROR: no .xlsx files in', SRC);
  process.exit(1);
}
const files = listXlsx(SRC);
const newest = (arr: string[]) => arr.slice().sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const txFile = newest(files.filter((f) => isTx(readHeaders(f))));
const donorFile = newest(files.filter((f) => isDonor(readHeaders(f))));
if (!txFile || !donorFile || txFile === donorFile) {
  console.error('ERROR: could not detect both TX + donor files distinctly.');
  console.error('  tx:', txFile && basename(txFile), '| donor:', donorFile && basename(donorFile));
  process.exit(1);
}
console.log('TX file:   ', basename(txFile));
console.log('Donor file:', basename(donorFile));

const txData = readSheet(txFile, 'dashboard');
const donorData = readSheet(donorFile, 'donateurs');
console.log('tx rows:', txData.length, '| donor rows:', donorData.length);

const ds = buildExtractionData(txData, donorData);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(ds));

const matched = ds.records.filter((r) => r.matched === 1).length;
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
console.log('\n========== EXTRACTION (DEV, PLAINTEXT) ==========');
console.log('records:', ds.meta.rows);
console.log('txTotalBase: €' + fmt(ds.meta.txTotalBase));
console.log(`matched to donor: ${matched} (${((matched / ds.meta.rows) * 100).toFixed(1)}%) | tx-only fallback: ${ds.meta.rows - matched}`);
const stip = new Map<string, number>();
for (const r of ds.records) stip.set(r.stip, (stip.get(r.stip) || 0) + 1);
console.log('\nTop stipulations (record counts):');
[...stip.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) => console.log('  ', k, v));
console.log('\nWrote', OUT, '(PLAINTEXT — gitignored, do not commit)');
