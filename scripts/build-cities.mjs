// build-cities.mjs — Build public/geo/cities-fr.json = { "<NORMALIZED CITY>": [lat, lng] }
//
// Source: La Poste "Base officielle des codes postaux" (laposte-hexasmal) via the
// datanova data-fair API. Each row has `nom_de_la_commune` + `_geopoint` ("lat,lng").
//
// To keep the file small we only emit centroids for cities that actually appear in
// our donation data (union of all cube[].city[][0]), normalized the SAME way the app
// normalizes user input + the data's Locality. Coordinates are the average GPS per
// normalized name, rounded to 5 decimals.
//
// Run: node scripts/build-cities.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DONVERSE = path.join(ROOT, 'public', 'data', 'donverse.json');
const OUT = path.join(ROOT, 'public', 'geo', 'cities-fr.json');

const API =
  'https://datanova.laposte.fr/data-fair/api/v1/datasets/laposte-hexasmal/lines';
const PAGE = 10000;

// Canonical city key — MUST stay identical to normCity() in the app
// (components/donverse/mapMetrics.ts) so user input, our data's Locality, and
// La Poste commune names all collapse to the same key.
// Steps: NFD accent-strip, uppercase, drop "(...)" suffix, hyphens/apostrophes
// -> space, drop arrondissement suffix ("MARSEILLE 08", "LYON 1ER ARRONDISSEMENT"),
// expand ST/STE -> SAINT/SAINTE, collapse whitespace, trim.
function normCity(s) {
  if (!s) return '';
  let n = String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents (combining diacritics)
    .toUpperCase()
    .replace(/\(.*$/, '') // drop "(...)" suffix and anything after it
    .replace(/[-']/g, ' ') // hyphens/apostrophes -> space
    .replace(/\s+/g, ' ')
    .trim();
  n = n.replace(/\s+\d+\s*(ER|EME|E)?\s*ARRONDISSEMENT$/, '');
  n = n.replace(/\s+\d{1,2}$/, ''); // trailing arrondissement number
  n = n.replace(/\bSTE\b/g, 'SAINTE').replace(/\bST\b/g, 'SAINT');
  return n.replace(/\s+/g, ' ').trim();
}

async function fetchAll() {
  const rows = [];
  let after = null;
  for (;;) {
    const params = new URLSearchParams({
      size: String(PAGE),
      select: 'nom_de_la_commune,_geopoint,code_postal',
    });
    if (after) params.set('after', after);
    const url = `${API}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const json = await res.json();
    const results = json.results || [];
    rows.push(...results);
    process.stdout.write(`\rFetched ${rows.length}/${json.total} rows...`);
    const next = json.next;
    if (!next || results.length === 0) break;
    const u = new URL(next);
    after = u.searchParams.get('after');
    if (!after) break;
  }
  process.stdout.write('\n');
  return rows;
}

async function main() {
  // 1) Cities present in our donation data.
  const donverse = JSON.parse(fs.readFileSync(DONVERSE, 'utf8'));
  const cube = donverse.cube || [];
  const dataCities = new Set();
  for (const c of cube) for (const row of c.city || []) dataCities.add(normCity(row[0]));
  dataCities.delete('');
  console.log(`Distinct normalized cities in donation data: ${dataCities.size}`);

  // 2) La Poste rows -> collect DISTINCT GPS points per normalized name.
  // We dedupe by rounded coordinate so a commune that spans many postcodes
  // (e.g. ST DENIS de la Réunion has ~13 postcode rows) counts ONCE, instead
  // of dragging the average toward whichever commune has the most postcodes.
  const rows = await fetchAll();
  const byName = new Map(); // norm -> Map<coordKey, { lat, lng, metro: bool }>
  for (const r of rows) {
    const norm = normCity(r.nom_de_la_commune);
    if (!norm || !dataCities.has(norm)) continue; // only keep data cities
    const gp = r._geopoint;
    if (!gp) continue;
    const [latS, lngS] = String(gp).split(',');
    const lat = Number(latS), lng = Number(lngS);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const cp = String(r.code_postal || '');
    const metro = !(cp.startsWith('97') || cp.startsWith('98')); // exclude DOM/TOM
    const coordKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    let pts = byName.get(norm);
    if (!pts) { pts = new Map(); byName.set(norm, pts); }
    if (!pts.has(coordKey)) pts.set(coordKey, { lat, lng, metro });
  }

  // 3) Average the distinct points per name. When metropolitan points exist,
  // ignore DOM/TOM homonyms (donation data is overwhelmingly metropolitan), so
  // e.g. "SAINT DENIS" resolves to the Île-de-France cluster, not La Réunion.
  const out = {};
  for (const [norm, pts] of byName) {
    let list = [...pts.values()];
    const metroPts = list.filter((p) => p.metro);
    if (metroPts.length) list = metroPts;
    const lat = list.reduce((s, p) => s + p.lat, 0) / list.length;
    const lng = list.reduce((s, p) => s + p.lng, 0) / list.length;
    out[norm] = [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5];
  }

  const matched = Object.keys(out).length;
  const unmatched = dataCities.size - matched;
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`Wrote ${OUT}`);
  console.log(`Entries (matched cities): ${matched}`);
  console.log(`Unmatched data cities (no La Poste centroid): ${unmatched}`);
  if (unmatched > 0) {
    const missing = [...dataCities].filter((c) => !(c in out)).slice(0, 25);
    console.log('Sample unmatched:', missing.join(' | '));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
