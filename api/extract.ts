// /api/extract — store & return the ENCRYPTED combined extraction dataset.
//
// PRIVACY INVARIANT: the body stored here is OPAQUE CIPHERTEXT produced in the
// browser (services/cryptoStore.ts encryptJSON). The server never sees, holds,
// or returns plaintext PII. Decryption happens only in the browser with the
// team password. Both methods are authed via the `x-dashboard-password` header.
//
// POST : body = the EncryptedPayload JSON ({v,alg,kdf,iter,gz,salt,iv,ct}).
//        We validate the envelope shape only, then store it deterministically
//        under blob key `extract-enc.json`.
//
// GET  : returns the stored ciphertext payload verbatim (or 404 if none yet).
//
// Storage: Vercel Blob (env `BLOB_READ_WRITE_TOKEN`). Note: although the blob
// URL is public, its content is AES-GCM ciphertext that is useless without the
// team password — no PII is exposed.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put, list } from '@vercel/blob';
import { isAuthorized } from './_auth';

const BLOB_KEY = 'extract-enc.json';

/** Locate the ciphertext blob, if any. Returns its public URL or null. */
async function findBlob(): Promise<{ url: string; uploadedAt: string } | null> {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY });
    const match = blobs.find((b) => b.pathname === BLOB_KEY) ?? blobs[0];
    if (!match) return null;
    return { url: match.url, uploadedAt: (match.uploadedAt as any) ?? '' };
  } catch {
    return null;
  }
}

/** Validate that the body looks like an EncryptedPayload (ciphertext envelope). */
function looksLikeCiphertext(b: any): boolean {
  return (
    b &&
    typeof b === 'object' &&
    b.alg === 'AES-GCM' &&
    typeof b.salt === 'string' &&
    typeof b.iv === 'string' &&
    typeof b.ct === 'string'
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Auth required for BOTH methods.
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'Mot de passe incorrect.' });
  }

  // ---------------------------------------------------------------- GET ----
  if (req.method === 'GET') {
    const blob = await findBlob();
    if (!blob) {
      return res.status(404).json({ ok: false, error: 'Aucune extraction enregistrée.' });
    }
    try {
      const resp = await fetch(blob.url, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`blob HTTP ${resp.status}`);
      const payload = await resp.json(); // opaque ciphertext envelope
      res.setHeader('x-extract-updated', blob.uploadedAt || '');
      return res.status(200).json({ ok: true, updatedAt: blob.uploadedAt || '', payload });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: 'Lecture de l’extraction impossible : ' + (e?.message || String(e)),
      });
    }
  }

  // --------------------------------------------------------------- POST ----
  if (req.method === 'POST') {
    const body = req.body;
    if (!looksLikeCiphertext(body)) {
      return res.status(400).json({
        ok: false,
        error: 'Charge utile invalide : un payload chiffré (salt/iv/ct) est attendu.',
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
        access: 'public', // content is ciphertext; public URL exposes no PII
        contentType: 'application/json',
        addRandomSuffix: false, // deterministic key → overwrite in place
      });
      return res.status(200).json({ ok: true, updatedAt: new Date().toISOString() });
    } catch (e: any) {
      return res.status(500).json({
        ok: false,
        error: 'Échec de l’enregistrement de l’extraction : ' + (e?.message || String(e)),
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
}
