// /api/data — read & write the shared DONVERSE dataset (anonymized only).
//
// GATED: both methods require the team password via `x-dashboard-password`
// (validated by api/_auth.isAuthorized; fail-closed if DASHBOARD_PASSWORD unset).
//
// GET  : Returns the latest dataset. If a blob `donverse-latest.json` exists,
//        fetch + return it (source "uploaded"); otherwise return the bundled
//        seed (source "seed"). Response carries `x-data-source` +
//        `x-data-updated` headers AND the same info inside the JSON envelope.
//
// POST : Body = an already-aggregated, anonymized DonverseData JSON (produced
//        client-side by the browser — raw PII never reaches this endpoint). We
//        validate minimally then overwrite the blob deterministically
//        (addRandomSuffix:false).
//
// Storage: Vercel Blob. Requires env `BLOB_READ_WRITE_TOKEN` (auto-provided on
// Vercel once a Blob store is linked to the project).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { put, list } from '@vercel/blob';
import { isAuthorized } from './_auth.js';

const BLOB_KEY = 'donverse-latest.json';

/** Read the bundled seed dataset (server-side, NOT publicly served). */
function readSeed(): any {
  // __dirname at runtime points at the compiled function location; the seed is
  // colocated under api/_data and bundled with the function by Vercel.
  const seedPath = join(__dirname, '_data', 'seed-donverse.json');
  const raw = readFileSync(seedPath, 'utf-8');
  return JSON.parse(raw);
}

/** Locate the latest-upload blob, if any. Returns its public URL or null. */
async function findLatestBlob(): Promise<{ url: string; uploadedAt: string } | null> {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY });
    const match = blobs.find((b) => b.pathname === BLOB_KEY) ?? blobs[0];
    if (!match) return null;
    return { url: match.url, uploadedAt: (match.uploadedAt as any) ?? '' };
  } catch {
    // No token / no store / network error → behave as "no upload yet".
    return null;
  }
}

/** Minimal shape validation for an uploaded DonverseData payload. */
function looksLikeDonverseData(d: any): boolean {
  return (
    d &&
    typeof d === 'object' &&
    d.meta && typeof d.meta === 'object' &&
    d.tx && typeof d.tx === 'object' &&
    d.donors && typeof d.donors === 'object'
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Shared-password gate: BOTH GET and POST require the team password header.
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'Mot de passe incorrect.' });
  }

  // ---------------------------------------------------------------- GET ----
  if (req.method === 'GET') {
    const latest = await findLatestBlob();
    if (latest) {
      try {
        const resp = await fetch(latest.url, { cache: 'no-store' });
        if (resp.ok) {
          const json = await resp.json();
          const lastUpdated = (json?.meta?.generatedAt as string) || latest.uploadedAt || '';
          res.setHeader('x-data-source', 'uploaded');
          res.setHeader('x-data-updated', lastUpdated);
          return res.status(200).json({ source: 'uploaded', lastUpdated, data: json });
        }
      } catch {
        // Fall through to seed if the blob can't be fetched.
      }
    }
    const seed = readSeed();
    const lastUpdated = (seed?.meta?.generatedAt as string) || '';
    res.setHeader('x-data-source', 'seed');
    res.setHeader('x-data-updated', lastUpdated);
    return res.status(200).json({ source: 'seed', lastUpdated, data: seed });
  }

  // --------------------------------------------------------------- POST ----
  if (req.method === 'POST') {
    // Vercel parses JSON bodies automatically when Content-Type is JSON.
    const body = req.body;
    if (!looksLikeDonverseData(body)) {
      return res.status(400).json({
        ok: false,
        error: 'Données invalides : il manque meta / tx / donors.',
      });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({
        ok: false,
        error: 'Stockage non configuré (BLOB_READ_WRITE_TOKEN manquant).',
      });
    }
    try {
      await put(BLOB_KEY, JSON.stringify(body), {
        access: 'public', // payload is anonymized; public URL is fine
        contentType: 'application/json',
        addRandomSuffix: false, // deterministic key → overwrite in place
      });
      const lastUpdated = (body?.meta?.generatedAt as string) || new Date().toISOString();
      return res.status(200).json({ ok: true, lastUpdated });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: 'Échec de l’enregistrement : ' + (e?.message || String(e)),
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
}
