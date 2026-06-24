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
//   `vite`), so we import the seed JSON directly and skip the password gate.
//   In production the gate + /api are always used.
import type { DonverseData } from '../components/donverse/types';

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
}

/** In dev we bypass the gate entirely (see header note). */
export const DEV_BYPASS = import.meta.env.DEV;

/** Validate a password against /api/auth. Returns true on 200. */
export async function checkPassword(pw: string): Promise<boolean> {
  const res = await fetch('/api/auth', {
    method: 'GET',
    headers: { [HEADER]: pw },
  });
  return res.ok;
}

/**
 * Load the latest shared dataset.
 *  - DEV: import the bundled seed directly (no network, no password).
 *  - PROD: GET /api/data with the stored password header.
 * Throws on 401 (so the caller can re-show the gate) or other errors.
 */
export async function loadDataset(): Promise<LoadedDataset> {
  if (DEV_BYPASS) {
    // Dev-only direct import of the (server-side) seed so `npm run dev` works
    // WITHOUT vercel dev or a password. Bundled only in the dev build.
    const seed = (await import('../api/_data/seed-donverse.json')).default as unknown as DonverseData;
    return { data: seed, source: 'dev', lastUpdated: seed.meta?.generatedAt || '' };
  }

  const pw = getStoredPassword() || '';
  const res = await fetch('/api/data', {
    method: 'GET',
    headers: { [HEADER]: pw },
  });
  if (res.status === 401) {
    const err: any = new Error('UNAUTHORIZED');
    err.code = 401;
    throw err;
  }
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
  const pw = getStoredPassword() || '';
  const res = await fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [HEADER]: pw },
    body: JSON.stringify(data),
  });
  if (res.status === 401) {
    const err: any = new Error('Mot de passe incorrect.');
    err.code = 401;
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `Échec de l’envoi (HTTP ${res.status}).`);
  }
  return { lastUpdated: json.lastUpdated || '' };
}
