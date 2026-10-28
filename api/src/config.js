const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
/**
 * Base URL: env.BETTER_AUTH_URL if set, otherwise the origin of the incoming request
 * (the web app and API share one Worker/origin, so the request origin is the public site).
 */
export const authUrl = (env, origin) => env.BETTER_AUTH_URL || origin || 'http://localhost:8787';
/** Trusted origins: env.TRUSTED_ORIGINS + the base URL (+ the request origin). */
export const trustedOrigins = (env, origin) =>
  [...new Set([...list(env.TRUSTED_ORIGINS), authUrl(env, origin), ...(origin ? [origin] : [])])];
