import { createApp } from './app.js';
import { runSyncLadder } from './functions.js';

const app = createApp();
export default {
  fetch: (request, env, ctx) => {
    // One canonical origin keeps auth cookies and trusted-origin checks on penged.dev.
    const url = new URL(request.url);
    if (url.hostname === 'www.penged.dev') {
      url.hostname = 'penged.dev';
      return Response.redirect(url.toString(), 301);
    }
    if (!url.pathname.startsWith('/api/') && env.ASSETS) return env.ASSETS.fetch(request);
    return app.fetch(request, env, ctx);
  },
  // Cron trigger (see wrangler.toml): same expiry/cleanup as the syncLadder function, no session needed.
  scheduled: (event, env, ctx) => {
    ctx.waitUntil(
      runSyncLadder({ env }).then(
        (r) => console.log('[cron] syncLadder', JSON.stringify(r)),
        (e) => console.error('[cron] syncLadder failed', e),
      ),
    );
  },
};
