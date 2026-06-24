// Client-side helpers for the DONVERSE shared-data API.
//
// OPEN ACCESS
//   The dashboard is open — no password gate. Every API call is unauthenticated.
//
// DEV FALLBACK
//   In `import.meta.env.DEV` the Vercel functions are not running (plain
//   `vite`), so we import the seed JSON directly. In production the /api
//   endpoints are always used.
import type { DonverseData } from '../components/donverse/types';

export interface LoadedDataset {
  data: DonverseData;
  source: 'uploaded' | 'seed' | 'dev';
  lastUpdated: string;
}

/** In dev we read the bundled seed directly (no network). */
export const DEV_BYPASS = import.meta.env.DEV;

/**
 * Load the latest shared dataset.
 *  1. Try GET /api/data and use it ONLY if it returns real JSON (the Vercel
 *     function returns the latest upload, or the bundled seed).
 *  2. Otherwise fall back to the static public seed `/data/donverse.json`.
 *     This makes dev work without the serverless functions (where Vite serves
 *     /api/data as a JS module, not JSON) and is also a safety net in prod.
 */
export async function loadDataset(): Promise<LoadedDataset> {
  try {
    const res = await fetch('/api/data', { headers: { accept: 'application/json' } });
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
  } catch {
    /* fall through to the static seed */
  }

  const res2 = await fetch('/data/donverse.json', { cache: 'no-store' });
  if (!res2.ok) throw new Error(`Données indisponibles (HTTP ${res2.status}).`);
  const data = (await res2.json()) as DonverseData;
  return { data, source: 'seed', lastUpdated: data.meta?.generatedAt || '' };
}

/** Upload an anonymized DonverseData payload. Throws with a French message. */
export async function uploadDataset(data: DonverseData): Promise<{ lastUpdated: string }> {
  const res = await fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `Échec de l’envoi (HTTP ${res.status}).`);
  }
  return { lastUpdated: json.lastUpdated || '' };
}
