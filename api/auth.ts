// GET /api/auth — validates the team password header only.
//
// Used by the PasswordGate screen to check a password BEFORE attempting to
// load any data. Returns 200 if the `x-dashboard-password` header matches
// `DASHBOARD_PASSWORD`, otherwise 401. No body of substance is returned.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isAuthorized } from './_auth.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'Mot de passe incorrect.' });
  }
  return res.status(200).json({ ok: true });
}
