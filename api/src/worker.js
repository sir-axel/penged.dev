import { createApp } from './app.js';
import { runSyncLadder } from './functions.js';

const app = createApp();
export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
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
