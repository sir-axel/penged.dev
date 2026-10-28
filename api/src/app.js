import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAuth } from './auth.js';
import { trustedOrigins } from './config.js';
import { HttpError } from './errors.js';
import { entities } from './entities.js';
import { functions } from './functions.js';
import { uploads, files } from './uploads.js';

export function createApp() {
  const app = new Hono().basePath('/api');

  app.use('*', (c, next) => cors({ origin: (o) => (trustedOrigins(c.env, new URL(c.req.url).origin).includes(o) ? o : null), credentials: true })(c, next));

  // CSRF defence in depth (on top of SameSite=Lax cookies): browsers always send Origin on POST, so when it is
  // present it must be this app or a trusted origin. A request with NO Origin header is a non-browser client
  // (curl, server-to-server), which cannot ride a victim's cookies, so it is allowed.
  const originGuard = async (c, next) => {
    const o = c.req.header('origin');
    if (o && c.req.method !== 'GET' && c.req.method !== 'HEAD' && !trustedOrigins(c.env, new URL(c.req.url).origin).includes(o)) {
      return c.json({ error: 'Cross-origin request blocked' }, 403);
    }
    return next();
  };
  app.use('/functions/*', originGuard);
  app.use('/uploads', originGuard);

  app.get('/health', (c) => c.json({ ok: true }));
  app.on(['GET', 'POST'], '/auth/*', (c) => getAuth(c.env, new URL(c.req.url).origin).handler(c.req.raw));
  app.route('/entities', entities);
  app.route('/functions', functions);
  app.route('/uploads', uploads);
  app.route('/files', files);

  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
    if (err instanceof SyntaxError) return c.json({ error: 'Invalid JSON.' }, 400);
    console.error(err);
    return c.json({ error: 'Something went wrong' }, 500);
  });
  return app;
}
