// Shared server-side password validation for the DONVERSE serverless API.
//
// One shared team password is provided via the Vercel env var
// `DASHBOARD_PASSWORD`. The client sends the password it has stored in
// sessionStorage as the `x-dashboard-password` header on every request.
//
// We compare with a length-safe, constant-time-ish equality so a wrong
// password cannot be probed via timing. This is a low-stakes, single
// shared secret — deliberately simple, not a full auth system.
import type { VercelRequest } from '@vercel/node';

const HEADER = 'x-dashboard-password';

/** Constant-time-ish string compare (avoids early-exit timing leaks). */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Read the password header (Vercel may give string | string[]). */
export function readPasswordHeader(req: VercelRequest): string {
  const raw = req.headers[HEADER];
  if (Array.isArray(raw)) return raw[0] ?? '';
  return raw ?? '';
}

/**
 * Returns true iff the request carries the correct team password.
 * If `DASHBOARD_PASSWORD` is unset on the server, ALL requests are rejected
 * (fail closed) — we never want to serve donor data with no gate.
 */
export function isAuthorized(req: VercelRequest): boolean {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected || expected.length === 0) return false; // fail closed
  const provided = readPasswordHeader(req);
  if (!provided) return false;
  return safeEqual(provided, expected);
}
