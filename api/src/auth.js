import { betterAuth } from 'better-auth';
import { authUrl, trustedOrigins } from './config.js';

import { hashPassword, verifyPassword } from './password.js';

// One instance per (env, request origin): the base URL may be derived from the request (see config.js).
const cache = new WeakMap();

/** Better Auth instance, built from the Worker env (cached per env object within an isolate). */
export function getAuth(env, origin) {
  const key = env.BETTER_AUTH_URL ? '' : origin || '';
  let byOrigin = cache.get(env);
  if (!byOrigin) cache.set(env, (byOrigin = new Map()));
  let a = byOrigin.get(key);
  if (a) return a;
  a = betterAuth({
    database: env.DB, // native D1 support
    secret: env.BETTER_AUTH_SECRET,
    baseURL: authUrl(env, origin),
    basePath: '/api/auth',
    trustedOrigins: trustedOrigins(env, origin),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
      requireEmailVerification: false,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    user: {
      additionalFields: { role: { type: 'string', required: false, defaultValue: 'user', input: false } },
    },
    // Rate limiting (stored in D1 so it holds across isolates). Client IP comes from Cloudflare's
    // cf-connecting-ip (x-forwarded-for is client-spoofable); with no IP header (plain local dev) BA skips limiting.
    // RATE_LIMIT=off (tests / .dev.vars only) disables it. Limits are per IP.
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    rateLimit: {
      enabled: env.RATE_LIMIT !== 'off',
      storage: 'database',
      window: 10,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 8 },
        '/sign-up/email': { window: 3600, max: 20 }, // shared office IPs sign up in bursts
      },
    },
  });
  byOrigin.set(key, a);
  return a;
}

/** Current session user ({id,email,name,role}) or null. */
export async function getUser(c) {
  const s = await getAuth(c.env, new URL(c.req.url).origin).api.getSession({ headers: c.req.raw.headers });
  if (!s?.user) return null;
  return s.user;
}
