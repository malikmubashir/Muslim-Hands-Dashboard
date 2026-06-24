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
 *  - DEV: import the bundled seed directly (no network).
 *  - PROD: GET /api/data (no auth).
 */
export async function loadDataset(): Promise<LoadedDataset> {
  if (DEV_BYPASS) {
    // Dev-only direct import of the (server-side) seed so `npm run dev` works
    // offline. Bundled only in the dev build.
    const seed = (await import('../api/_data/seed-donverse.json')).default as unknown as DonverseData;
    return { data: seed, source: 'dev', lastUpdated: seed.meta?.generatedAt || '' };
  }

  const res = await fetch('/api/data', { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return {
    data: json.data as DonverseData,
    source: (json.source as LoadedDataset['source']) || 'uploaded',
    lastUpdated: json.lastUpdated || '',
  };
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
