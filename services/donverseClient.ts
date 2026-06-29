// Client-side helpers for the DONVERSE shared-data API + password gate.
//
// AUTH MODEL
//   One shared team password, validated server-side. We keep it in
//   sessionStorage (NOT localStorage) so it lives only for the browser
//   session/tab and is cleared when the tab closes. Every API call sends it
//   as the `x-dashboard-password` header.
//
// DEV FALLBACK
//   In `import.meta.env.DEV` the Vercel functions are not running (plain
//   `vite`), so we read the static public seed `public/data/donverse.json`
//   directly and skip the password gate. In production the gate + /api
//   endpoints are always required.
//
// EXTRACTION (PII) DATASET
//   The combined donor+transaction dataset is stored ENCRYPTED via /api/extract
//   (ciphertext only). On login we fetch the ciphertext and decrypt it in the
//   browser with the session password, caching the result in MEMORY only.
import type { DonverseData } from '../components/donverse/types';
import { decryptJSON, type EncryptedPayload } from './cryptoStore';
import type { ExtractionDataset, ExtractionRecord } from '../lib/buildExtractionData';

const STORAGE_KEY = 'mh_dashboard_pw';
const HEADER = 'x-dashboard-password';

export interface LoadedDataset {
  data: DonverseData;
  source: 'uploaded' | 'seed' | 'dev';
  lastUpdated: string;
}

// ---- sessionStorage password helpers ----
export function getStoredPassword(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
export function setStoredPassword(pw: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, pw);
  } catch {
    /* ignore */
  }
}
export function clearStoredPassword(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  // Also drop any decrypted PII held in memory.
  extractionCache = null;
}

/** In dev we bypass the gate entirely (Vite serves no /api functions). */
// `import.meta.env.DEV` can be clobbered to `false` by the `define:
// { 'process.env': {} }` shim in vite.config (needed so libs that read
// process.env don't crash in the browser). MODE stays reliable, so we treat
// any non-production MODE as local dev. In a real `vite build` MODE is
// 'production', so this is false on Vercel + in `vite preview`.
export const DEV_BYPASS = import.meta.env.DEV || import.meta.env.MODE !== 'production';

/** Validate a password against /api/auth. Returns true on 200. */
export async function checkPassword(pw: string): Promise<boolean> {
  if (DEV_BYPASS) return true; // dev has no serverless auth endpoint
  try {
    const res = await fetch('/api/auth', {
      method: 'GET',
      headers: { [HEADER]: pw },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Load the latest shared (anonymized) dataset.
 *  - DEV: read the static public seed directly (no network, no password).
 *  - PROD: GET /api/data with the stored password header. Falls back to the
 *    static public seed only if the API is unreachable (defensive).
 * Throws on 401 (so the caller can re-show the gate).
 */
export async function loadDataset(): Promise<LoadedDataset> {
  if (DEV_BYPASS) {
    const res = await fetch('/data/donverse.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Données indisponibles (HTTP ${res.status}).`);
    const data = (await res.json()) as DonverseData;
    return { data, source: 'dev', lastUpdated: data.meta?.generatedAt || '' };
  }

  const pw = getStoredPassword() || '';
  let res: Response;
  try {
    res = await fetch('/api/data', {
      method: 'GET',
      headers: { accept: 'application/json', [HEADER]: pw },
    });
  } catch {
    // Network failure: fall back to the static seed (dev-style safety net).
    const res2 = await fetch('/data/donverse.json', { cache: 'no-store' });
    if (!res2.ok) throw new Error(`Données indisponibles (HTTP ${res2.status}).`);
    const data = (await res2.json()) as DonverseData;
    return { data, source: 'seed', lastUpdated: data.meta?.generatedAt || '' };
  }
  if (res.status === 401) {
    const err: any = new Error('UNAUTHORIZED');
    err.code = 401;
    throw err;
  }
  // Use /api/data only if it actually returned JSON; otherwise (functions
  // unavailable, a non-JSON error page, etc.) fall back to the static seed.
  const ct = res.headers.get('content-type') || '';
  if (res.ok && ct.includes('application/json')) {
    const json = await res.json();
    if (json && json.data) {
      return {
        data: json.data as DonverseData,
        source: (json.source as LoadedDataset['source']) || 'uploaded',
        lastUpdated: json.lastUpdated || '',
      };
    }
  }
  const res2 = await fetch('/data/donverse.json', { cache: 'no-store' });
  if (!res2.ok) throw new Error(`Données indisponibles (HTTP ${res2.status}).`);
  const data = (await res2.json()) as DonverseData;
  return { data, source: 'seed', lastUpdated: data.meta?.generatedAt || '' };
}

/** Upload an anonymized DonverseData payload. Throws with a French message. */
export async function uploadDataset(data: DonverseData): Promise<{ lastUpdated: string }> {
  const pw = getStoredPassword() || '';
  let res: Response;
  try {
    res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [HEADER]: pw },
      body: JSON.stringify(data),
    });
  } catch (e: any) {
    throw new Error('Connexion au serveur impossible (réseau). ' + (e?.message || ''));
  }
  if (res.status === 401) {
    const err: any = new Error('Mot de passe incorrect.');
    err.code = 401;
    throw err;
  }
  const raw = await res.text();
  let json: any = {};
  try { json = raw ? JSON.parse(raw) : {}; } catch { /* non-JSON error page */ }
  if (!res.ok || json.ok === false) {
    const detail = json.error || (raw ? raw.slice(0, 180) : '');
    throw new Error(`Échec de l’envoi (HTTP ${res.status}). ${detail}`.trim());
  }
  return { lastUpdated: json.lastUpdated || '' };
}

// =====================================================================
// ENCRYPTED EXTRACTION (PII) DATASET
// =====================================================================

/** POST the already-encrypted ciphertext payload to /api/extract. */
export async function uploadExtractionCiphertext(payload: EncryptedPayload): Promise<void> {
  const pw = getStoredPassword() || '';
  let res: Response;
  try {
    res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [HEADER]: pw },
      body: JSON.stringify(payload),
    });
  } catch (e: any) {
    throw new Error('Connexion au serveur impossible (réseau). ' + (e?.message || ''));
  }
  if (res.status === 401) {
    const err: any = new Error('Mot de passe incorrect.');
    err.code = 401;
    throw err;
  }
  const raw = await res.text();
  let json: any = {};
  try { json = raw ? JSON.parse(raw) : {}; } catch { /* non-JSON error page */ }
  if (!res.ok || json.ok === false) {
    const detail = json.error || (raw ? raw.slice(0, 180) : '');
    throw new Error(`Échec de l’enregistrement de l’extraction (HTTP ${res.status}). ${detail}`.trim());
  }
}

/**
 * Fetch the stored ciphertext payload from /api/extract.
 * Returns null if no extraction has been stored yet (404).
 */
export async function loadExtractionCiphertext(): Promise<EncryptedPayload | null> {
  const pw = getStoredPassword() || '';
  const res = await fetch('/api/extract', {
    method: 'GET',
    headers: { accept: 'application/json', [HEADER]: pw },
  });
  if (res.status === 404) return null;
  if (res.status === 401) {
    const err: any = new Error('UNAUTHORIZED');
    err.code = 401;
    throw err;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json?.payload as EncryptedPayload) ?? null;
}

// In-memory cache of the decrypted extraction dataset. NOT persisted to
// session/local storage — plaintext PII lives only in this tab's memory.
let extractionCache: ExtractionDataset | null = null;
let extractionPromise: Promise<ExtractionDataset | null> | null = null;

/**
 * Fetch + decrypt the extraction dataset ONCE and cache it in memory.
 * Subsequent calls return the cached value (or the in-flight promise).
 * Returns null if no extraction has been stored yet.
 * Decryption uses the session password (sessionStorage) — browser only.
 */
export async function getExtractionDataset(): Promise<ExtractionDataset | null> {
  if (extractionCache) return extractionCache;
  if (extractionPromise) return extractionPromise;

  // DEV: no /api/extract function and no ciphertext. Read a local PLAINTEXT
  // dataset (public/data/extraction-dev.json, gitignored) so the Extraction
  // tab is fully testable on the plain `vite` dev server. Generate it with
  // `npx tsx scripts/extract-dev.ts`. Never used in production.
  if (DEV_BYPASS) {
    extractionPromise = (async () => {
      try {
        const res = await fetch('/data/extraction-dev.json', { cache: 'no-store' });
        if (!res.ok) return null;
        const dataset = (await res.json()) as ExtractionDataset;
        extractionCache = dataset;
        return dataset;
      } catch {
        return null;
      }
    })().finally(() => { extractionPromise = null; });
    return extractionPromise;
  }

  extractionPromise = (async () => {
    const payload = await loadExtractionCiphertext();
    if (!payload) return null;
    const pw = getStoredPassword() || '';
    const dataset = await decryptJSON<ExtractionDataset>(payload, pw);
    extractionCache = dataset;
    return dataset;
  })().finally(() => { extractionPromise = null; });

  return extractionPromise;
}

/** Convenience: just the enriched records (fetch+decrypt+cache once). */
export async function getExtractionRecords(): Promise<ExtractionRecord[]> {
  const ds = await getExtractionDataset();
  return ds?.records ?? [];
}

/** Drop the in-memory decrypted extraction (e.g. on logout). */
export function clearExtractionCache(): void {
  extractionCache = null;
  extractionPromise = null;
}

// Re-export the enriched record type for the Extraction view (next phase).
export type { ExtractionRecord, ExtractionDataset } from '../lib/buildExtractionData';
