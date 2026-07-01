// /api/extract — store & serve the ENCRYPTED combined extraction dataset.
//
// PRIVACY INVARIANT: the stored object is OPAQUE CIPHERTEXT produced in the
// browser (services/cryptoStore.ts encryptJSON). The server never sees, holds,
// or returns plaintext PII. Decryption happens only in the browser with the
// team password.
//
// WHY CLIENT-DIRECT UPLOAD: the ciphertext for the full donor base is tens of
// MB — far above Vercel's 4.5 MB serverless request/response limit. So the file
// is uploaded DIRECTLY from the browser to Vercel Blob (@vercel/blob/client
// `upload`), and downloaded directly from the Blob URL. This endpoint only:
//   POST : issues a short-lived client upload token (handleUpload). Auth is the
//          team password, passed as the client payload (over HTTPS).
//   GET  : returns the current ciphertext blob URL (authed via the
//          `x-dashboard-password` header). The browser then fetches that URL.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { list } from '@vercel/blob';
import { isAuthorized } from './_auth.js';

const BLOB_KEY = 'extract-enc.json';

/** Constant-time-ish compare (avoid early-exit timing leaks). */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // -------------------------------------------------------------- GET ----
  // Return the current ciphertext blob URL (the browser fetches it directly).
  if (req.method === 'GET') {
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: 'Mot de passe incorrect.' });
    }
    try {
      const { blobs } = await list({ prefix: BLOB_KEY });
      const match = blobs.find((b) => b.pathname === BLOB_KEY) ?? blobs[0];
      if (!match) {
        return res.status(404).json({ ok: false, error: 'Aucune extraction enregistrée.' });
      }
      return res.status(200).json({ ok: true, url: match.url, updatedAt: (match.uploadedAt as any) ?? '' });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: 'Lecture de l’extraction impossible : ' + (e?.message || String(e)) });
    }
  }

  // -------------------------------------------------------------- POST ---
  // Client-upload token flow. The browser's upload() posts here; we authorise
  // via the client payload (team password) and hand back an upload token.
  if (req.method === 'POST') {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({ ok: false, error: 'Stockage non configuré (BLOB_READ_WRITE_TOKEN manquant).' });
    }
    try {
      const json = await handleUpload({
        body: req.body as HandleUploadBody,
        request: req,
        onBeforeGenerateToken: async (_pathname, clientPayload) => {
          const expected = process.env.DASHBOARD_PASSWORD || '';
          if (!expected || !clientPayload || !safeEqual(clientPayload, expected)) {
            throw new Error('Mot de passe incorrect.');
          }
          return {
            allowedContentTypes: ['application/json'],
            addRandomSuffix: false,          // deterministic key → overwrite in place
            maximumSizeInBytes: 250 * 1024 * 1024,
          };
        },
        onUploadCompleted: async () => { /* nothing to record */ },
      });
      return res.status(200).json(json);
    } catch (e: any) {
      return res.status(400).json({ ok: false, error: e?.message || String(e) });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
}
