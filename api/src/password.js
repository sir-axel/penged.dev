// PBKDF2-SHA256 password hashing via WebCrypto, replacing Better Auth's default scrypt (pure JS, far too slow
// for the free Workers plan's 10 ms CPU limit). workerd runs PBKDF2 natively (off the JS interpreter), measured
// ~1.6 ms for 20k iterations on a laptop (10k ~0.8 ms, 100k ~7.4 ms; workerd caps PBKDF2 at 100k iterations).
// The iteration count is stored in the hash, so ITERATIONS can be raised later without invalidating old hashes:
//   pbkdf2$<iterations>$<salt b64>$<hash b64>
export const ITERATIONS = 20000;
const MAX_ITERATIONS = 100000;
const enc = new TextEncoder();

const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword({ hash, password }) {
  try {
    const [scheme, iter, salt, expected] = String(hash).split('$');
    const iterations = Number(iter);
    if (scheme !== 'pbkdf2' || !Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) return false;
    const want = unb64(expected);
    const got = await derive(password, unb64(salt), iterations);
    if (want.length !== got.length) return false;
    let diff = 0; // constant-time compare
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
    return diff === 0;
  } catch {
    return false;
  }
}
