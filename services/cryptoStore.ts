// services/cryptoStore.ts
//
// Browser-side encryption helper for the COMBINED donor+transaction extraction
// dataset. The server NEVER sees plaintext PII: we encrypt with the team
// password in the browser and POST only the ciphertext; on login we GET the
// ciphertext and decrypt it in the browser with the same password.
//
// Scheme (standard, no custom crypto):
//   key  = PBKDF2(SHA-256, password, salt, 310000 iters) -> AES-GCM 256
//   salt = 16 random bytes
//   iv   = 12 random bytes (AES-GCM nonce)
//   ct   = AES-GCM( gzip(JSON.stringify(obj)) | JSON.stringify(obj) )
//   The GCM auth tag is appended to `ct` by WebCrypto; a wrong password fails
//   the tag check and decryptJSON throws.
//
// Payload is fully self-describing: { v, alg, kdf, iter, gz, salt, iv, ct }.

const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedPayload {
  v: 1;                 // payload format version
  alg: 'AES-GCM';       // symmetric algorithm
  kdf: 'PBKDF2-SHA256'; // key-derivation function
  iter: number;         // PBKDF2 iterations
  gz: boolean;          // whether the plaintext was gzip-compressed before encryption
  salt: string;         // base64 PBKDF2 salt
  iv: string;           // base64 AES-GCM iv/nonce
  ct: string;           // base64 ciphertext (incl. GCM auth tag)
}

// ---- base64 <-> bytes ----
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000; // avoid call-stack limits on large arrays
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Return a plain ArrayBuffer copy of a byte view. WebCrypto / Blob accept
 * BufferSource, but the TS DOM lib (5.4) rejects `Uint8Array<ArrayBufferLike>`
 * because its backing buffer might be a SharedArrayBuffer; copying to a fresh
 * ArrayBuffer makes the type concrete and is safe for our small buffers.
 */
function ab(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

// ---- optional gzip via CompressionStream (when available) ----
async function maybeGzip(data: Uint8Array): Promise<{ bytes: Uint8Array; gz: boolean }> {
  if (typeof (globalThis as any).CompressionStream === 'undefined') {
    return { bytes: data, gz: false };
  }
  try {
    const cs = new (globalThis as any).CompressionStream('gzip');
    const stream = new Blob([ab(data)]).stream().pipeThrough(cs);
    const buf = await new Response(stream).arrayBuffer();
    return { bytes: new Uint8Array(buf), gz: true };
  } catch {
    return { bytes: data, gz: false };
  }
}
async function maybeGunzip(data: Uint8Array, gz: boolean): Promise<Uint8Array> {
  if (!gz) return data;
  const ds = new (globalThis as any).DecompressionStream('gzip');
  const stream = new Blob([ab(data)]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

// ---- key derivation ----
async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    ab(enc.encode(password)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: ab(salt), iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt an arbitrary JSON-serializable object with the team password.
 * Returns a self-describing payload that can be JSON.stringify'd and stored.
 */
export async function encryptJSON(obj: unknown, password: string): Promise<EncryptedPayload> {
  if (!password) throw new Error('Mot de passe manquant pour le chiffrement.');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);

  const plain = enc.encode(JSON.stringify(obj));
  const { bytes, gz } = await maybeGzip(plain);

  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ab(iv) }, key, ab(bytes));

  return {
    v: 1,
    alg: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iter: PBKDF2_ITERATIONS,
    gz,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ctBuf)),
  };
}

/**
 * Decrypt a payload produced by encryptJSON. Throws if the password is wrong
 * (AES-GCM authentication failure) or the payload is malformed.
 */
export async function decryptJSON<T = any>(payload: EncryptedPayload, password: string): Promise<T> {
  if (!password) throw new Error('Mot de passe manquant pour le déchiffrement.');
  if (!payload || payload.v !== 1 || payload.alg !== 'AES-GCM') {
    throw new Error('Format de données chiffrées non reconnu.');
  }
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ct = base64ToBytes(payload.ct);
  const key = await deriveKey(password, salt, payload.iter || PBKDF2_ITERATIONS);

  let plainBytes: Uint8Array;
  try {
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ab(iv) }, key, ab(ct));
    plainBytes = new Uint8Array(buf);
  } catch {
    // GCM auth-tag mismatch => wrong password (or corrupted ciphertext).
    throw new Error('Mot de passe incorrect ou données corrompues.');
  }
  const json = dec.decode(await maybeGunzip(plainBytes, !!payload.gz));
  return JSON.parse(json) as T;
}
