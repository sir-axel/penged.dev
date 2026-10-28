# Penged.dev

Verified workplace ping-pong ladder: record singles/doubles matches, every player signs off, ratings/levels/ranks move only on verified results. Rebuilt from a Base44 app as a self-hosted stack that runs entirely on **Cloudflare's free tier** — one Worker serves the React SPA (Workers Static Assets) and the API (Hono), with D1 (SQLite) for data (avatars in D1, or R2 if you enable it).

```
web/   Vite + React 18 + react-router 6 + TanStack Query + Tailwind + Radix  -> static build in web/dist
api/   Hono on Cloudflare Workers, D1 (SQL migrations), optional R2, Better Auth (email + password)
scrape/  the original Base44 scrape (spec, de-minified source, screenshots) used for the port
verify/  Playwright screenshots + end-to-end run output
```

Google sign-in: not implemented yet. Email/password only.

## Run locally

```bash
npm run install:all                     # installs web/ and api/
cp api/.dev.vars.example api/.dev.vars  # then edit BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run dev                             # builds web, applies D1 migrations locally, runs `wrangler dev` on :8787
```

Open http://localhost:8787 (web + API on one origin; local D1/R2 are emulated by miniflare and persisted in `api/.wrangler/state`).
For hot-reload of the UI: keep `npm --prefix api run dev` running and, in another terminal, `npm run dev:web` (Vite on :5173 proxies `/api` to :8787; add `http://localhost:5173` to `TRUSTED_ORIGINS` in `api/.dev.vars`).

Demo data: `npm --prefix api run seed` (add `-- --reset` to wipe and reseed) creates 6 players, 7 verified matches, a pending match and an open challenge. Demo login: `demo@penged.test` / `demo1234demo`.

Admins (forfeit review at `/admin/reviews`) are granted only by a command, never by email: `npm --prefix api run make-admin -- someone@example.com` locally (the user must have signed up; the seed already makes `admin@penged.test` an admin). In production: `npx wrangler d1 execute penged --remote --command "UPDATE \"user\" SET role='admin' WHERE email='someone@example.com'"`.

Feedback: `/feedback` is public (signed-out visitors may send a note; honeypot + 5/hour per hashed IP + 20/day per user). Notes live in the `feedback` table (migration 0009), never in the entity endpoints; admins read them at `/admin/feedback` via the `listFeedback` / `updateFeedback` functions.

Sign-up deviation: the original asked for an emailed verification code after registering. With no email service this step is skipped: registering signs you in immediately and sends you to `/welcome` to claim your username.

Tests: `npm test` (rating math + game validator unit tests, and integration tests that drive the real Hono app against local D1/R2 via wrangler's platform proxy).

Password reset: not available. There is no email service, so "forgot password" and "change password" are removed rather than shipped half-working. Add them back once an email provider (e.g. Resend's free tier) is wired in.

## Deploy (free) — step by step

Prereqs: a free Cloudflare account, Node 20+. **Nothing in this repo has been deployed.**

```bash
cd api
npx wrangler login
npx wrangler d1 create penged                 # copy the printed database_id into api/wrangler.toml
# avatars are stored in D1 by default; to use R2 instead (may need a payment method) create a bucket and uncomment [[r2_buckets]] in wrangler.toml
npm run migrate:remote
npx wrangler secret put BETTER_AUTH_SECRET    # long random string
# optional: BETTER_AUTH_URL var / TRUSTED_ORIGINS; by default the base URL is derived from the request origin
cd .. && npm run deploy                       # builds web, then `wrangler deploy`
```

Custom domain: Cloudflare dashboard -> Workers & Pages -> penged -> Settings -> Domains & Routes -> Add custom domain (or add a `routes = [{ pattern = "penged.example.com", custom_domain = true }]` entry in `wrangler.toml`). 

Future integrations: the API boundary is plain HTTP under `/api` (entities read API, `/api/functions/:name`, `/api/auth/*`, `/api/uploads`). Set `TRUSTED_ORIGINS` (comma separated) to allow other origins; point the web build at a different API with `VITE_API_URL`.

### Free-tier limits that matter (check Cloudflare's current pricing page)
- Workers: 100,000 requests/day, 10 ms CPU per request (password hashing in Better Auth is the heaviest call; fine for a small office). Static assets requests are free and unlimited.
- D1: 5 GB storage, 5 million rows read/day, 100,000 rows written/day.
- R2: 10 GB storage, 1M writes + 10M reads per month, no egress fees. Avatars default to D1 (resized in the browser to 256px, capped at 200 KB).

## How it works
- Entities `Player`, `Match`, `Challenge` are publicly readable (`GET /api/entities/:Entity?filter=<json>&sort=-created_date&limit=`), with Mongo-lite filters (`$gte/$lte/$gt/$lt/$ne/$in`, array containment for `all_player_ids` etc.). All writes go through the nine functions: `createPlayer, updatePlayer, submitMatch, respondMatch, createChallenge, respondChallenge, resolveChallenge, syncLadder, deleteAccount` (`POST /api/functions/:name`).
- D1 has no interactive transactions, so each mutation computes all its writes and applies them in one `DB.batch()` guarded by version counters (see `api/src/db.js`); conflicts retry or return 409.
- Rating rules live in the pure module `api/src/rating.js` (Elo with paddle edge, smooth K, rust, opponent certainty, match-length evidence, recency-weighted rematches, doubles team averages + partner split, challenge stakes, ±80 cap, floor 700, XP/level, active rating-derived ranks). `api/scripts/simulate.js` compares it against the legacy rules.

## Security notes
- Passwords: PBKDF2-SHA256 via WebCrypto (20k iterations, versioned hash format) to stay inside the free Workers 10 ms CPU limit.
- Better Auth rate limiting is on (database storage, keyed on `cf-connecting-ip`); `RATE_LIMIT=off` in `.dev.vars` disables it locally only.
- State-changing requests to `/api/functions/*` and `/api/uploads` must come from the app origin (or `TRUSTED_ORIGINS`).
- A cron trigger (every 15 min) expires overdue challenges/matches; `syncLadder` does the same on demand.
- Not done: real password-reset email (link is logged), Google sign-in, anonymising deleted players' history.
