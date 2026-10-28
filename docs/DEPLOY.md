# Penged first deploy (Cloudflare, free) - researched 2026-10-28

## 0. Blockers to know BEFORE deploying

1. **Free Workers = 10 ms CPU per request** (https://developers.cloudflare.com/workers/platform/limits/). Better Auth's default password hash is scrypt (memory-hard, tens to 100+ ms of CPU). Expect sign-up/sign-in to fail with "Exceeded CPU" (error 1102) on Free. `api/src/auth.js` does NOT override it. PBKDF2 at OWASP strength (600k iterations) measured 65-66 ms in workerd (https://github.com/halideworks/onelight/wiki/_history), 6x over the cap. One third-party package claims 20k-80k iterations fit 10 ms (https://npmjs.com/package/pbkdf2-lite); not official, unmeasured here.
   Options: (a) set `emailAndPassword.password: { hash, verify }` to Web Crypto PBKDF2-SHA256 with a LOW count (start ~10,000-20,000, benchmark under `wrangler dev` / `wrangler tail` CPU ms, keep a margin; weaker than OWASP, so use a unique per-user salt and enforce min password length); (b) Workers Paid ($5/mo) raises CPU to 30 s default and allows 600k; (c) accept that free tier = weak hashing. Note: CPU time excludes time awaiting D1/R2, but includes crypto. Static asset requests don't count.
2. **R2 requires an R2 subscription via checkout** (https://developers.cloudflare.com/r2/get-started/ "Complete the checkout flow to add an R2 subscription"). Docs do not say "card"; multiple user reports (2026) say a card/PayPal is demanded even for the free 10 GB. Treat as: R2 needs a payment method on file, $0 while under free tier. If no card is acceptable, store avatars in D1 as small base64/BLOB (cap ~100 KB, resize client-side) or skip avatars. D1/Workers/Assets need no card.
3. Free-plan 100k Worker requests/day: when exceeded, `/api/*` (run_worker_first) returns 429 instead of falling back to assets (https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/). Fine for an office ladder.

## 1. Limits table (Free plan, verified)

| Item | Free limit | Source |
|---|---|---|
| Worker requests | 100,000/day (reset 00:00 UTC) | workers/platform/limits |
| CPU per HTTP request / per cron | 10 ms | workers/platform/limits |
| Subrequests | 50/invocation (D1/R2 calls count toward bindings limits, not 50 fetches, but keep batches small) | same |
| Memory | 128 MB | same |
| Worker size | 64 MiB uncompressed (docs figure) | same |
| Static assets | free and unlimited requests; 20,000 files/version; 25 MiB/file | limits + static-assets/billing-and-limitations |
| Cron Triggers | 5 per account | workers/platform/limits |
| D1 rows read | 5,000,000/day | d1/platform/pricing |
| D1 rows written | 100,000/day | d1/platform/pricing |
| D1 storage | 5 GB account, 500 MB/db, 10 dbs | d1/platform/pricing, d1/platform/limits |
| D1 bound params | 100 per query | d1/platform/limits |
| R2 storage | 10 GB-month free | r2/pricing |
| R2 ops | 1M Class A + 10M Class B per month free | r2/pricing |
| R2 egress | free | r2/pricing |
| R2 enable | subscription checkout; card/PayPal reportedly required | r2/get-started |
| Custom domain | needs an active Cloudflare zone (domain added to your CF account, nameservers pointed to CF); no plan restriction documented; hostname can't have an existing CNAME | workers/configuration/routing/custom-domains |
| workers.dev | free `https://penged.<account>.workers.dev`, no domain needed | - |

Cron on Free: yes, up to 5 triggers, 10 ms CPU each. Good for syncLadder expiry if each run does a few batched SQL statements (no hashing). Add to wrangler.toml:
```toml
[triggers]
crons = ["17 */6 * * *"]
```
and export `scheduled(event, env, ctx)` from worker.js.

## 2. wrangler.toml review (/Users/axel/penged/api/wrangler.toml)

OK: `main`, `compatibility_date = "2026-06-01"` (past, valid), `nodejs_compat` (Better Auth needs it), `[assets]` with `directory`, `binding`, `not_found_handling = "single-page-application"`, `run_worker_first = ["/api/*"]` (array form valid on wrangler 4; `bucket` field not needed), D1 `migrations_dir`, R2 binding.

Fixes / suggestions:
- `database_id` is a placeholder; must be replaced from `wrangler d1 create` output (or omit it - wrangler >=4.?? can auto-provision on deploy, but explicit is safer).
- `BETTER_AUTH_URL = "http://localhost:8787"` in `[vars]` would ship to production. Override: put the real URL there before deploy, or use `[env.production.vars]`, or `wrangler deploy --var BETTER_AUTH_URL:https://penged.dev`. Wrong value breaks cookies/CSRF origin checks (login 403 "Invalid origin"). Also set TRUSTED_ORIGINS if serving on both workers.dev and penged.dev.
- Add `workers_dev = true` (default) explicitly, and for a custom domain:
  ```toml
  routes = [{ pattern = "penged.dev", custom_domain = true }]
  ```
  (domain must be a zone in this CF account; do this only after the zone is active).
- Add `[observability] enabled = true` so reset links logged with console.log are visible in the dashboard Logs (free, limited retention) besides `wrangler tail`.
- `assets.directory = "../web/dist"` must exist at deploy: root `npm run deploy` builds web first. Running `wrangler deploy` from api/ alone without build fails.
- `api/package.json` has no remote migrate script. Add `"migrate:remote": "wrangler d1 migrations apply penged --remote"` (the command below works without it).
- wrangler is `^4.154.0` in devDependencies - fine; use `npx wrangler` from api/.
- Secrets are not in toml (correct): BETTER_AUTH_SECRET, ADMIN_EMAILS.
- Password hashing override: see Blocker 1.
- The R2 bucket binding makes `wrangler deploy` fail if the bucket doesn't exist (and bucket creation fails without R2 enabled).

## 3. Password-reset email later (free options)

| Option | Free tier | Notes |
|---|---|---|
| Resend | 3,000/mo, 100/day, 3 domains (https://resend.com/pricing) | Simplest: one fetch() to REST API from the Worker; needs a verified sending domain (DNS records) to email arbitrary users; no card |
| Brevo | free plan with daily cap (300/day historically; pricing page excerpt did not show the number) and Brevo branding | SMTP/API; verify sender |
| Cloudflare Email Service `send_email` binding | Can send to arbitrary recipients once a domain is onboarded; before that only to verified destination addresses; new accounts get a conservative daily quota (https://developers.cloudflare.com/email-service/platform/limits/). Pricing page not checked; may be a paid-plan feature | Native binding, no API key. Email Routing (inbound) is free but only receives |
Recommendation: Resend free via fetch inside `sendResetPassword` (wrap in `ctx.waitUntil`), key stored as secret `RESEND_API_KEY`. Until then, copy links from `wrangler tail`.

## 4. First deploy from zero

```bash
# 0. prerequisites: Node 20+, repo cloned
cd /Users/axel/penged && npm run install:all

# 1. Account: sign up at https://dash.cloudflare.com/sign-up (verify email). No card needed for Workers/D1.
cd api
npx wrangler login            # opens browser; approve
npx wrangler whoami

# 2. D1
npx wrangler d1 create penged
#   -> copy "database_id" into api/wrangler.toml [[d1_databases]] database_id

# 3. R2 (needs R2 subscription: dash.cloudflare.com -> R2 -> Purchase/enable; may ask for card, $0 within free tier)
npx wrangler r2 bucket create penged-avatars

# 4. Set production URL in wrangler.toml [vars] BETTER_AUTH_URL
#    (first deploy: https://penged.<subdomain>.workers.dev - you learn <subdomain> from step 8; deploy once, then update and redeploy)

# 5. Migrations on remote
npx wrangler d1 migrations apply penged --remote

# 6. Secrets
openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET
echo "you@example.com" | npx wrangler secret put ADMIN_EMAILS    # comma-separated admins
#   (secret put before first deploy creates the Worker; if it errors, run deploy first then put secrets)

# 7. Build web + deploy
cd .. && npm run build
cd api && npx wrangler deploy
#   prints https://penged.<account>.workers.dev

# 8. Fix BETTER_AUTH_URL to that URL (or https://penged.dev), redeploy: npx wrangler deploy
# 9. Smoke test: open URL, sign up (watch `npx wrangler tail` for "Exceeded CPU" -> Blocker 1), check /api health route, upload avatar (R2).
```

Custom domain penged.dev (only if user owns it):
1. Dashboard -> Add a domain -> penged.dev -> Free plan; change registrar nameservers to the two Cloudflare NS; wait for "Active".
2. Add to wrangler.toml `routes = [{ pattern = "penged.dev", custom_domain = true }]` (optionally also `www.penged.dev`), set BETTER_AUTH_URL = "https://penged.dev", TRUSTED_ORIGINS = "https://penged.<account>.workers.dev" if desired, `wrangler deploy`. Cloudflare creates DNS record and certificate automatically (a few minutes). No existing CNAME may be on that hostname.
If not owned: stay on workers.dev (free). A domain registered at Cloudflare Registrar is at-cost, not free.

## 5. GitHub Actions auto-deploy (github.com/sir-axel/penged.dev)

1. Dashboard -> My Profile -> API Tokens -> Create Token -> template "Edit Cloudflare Workers" (add D1 Edit and, if used, R2 Edit; for the custom domain add Zone:DNS/Workers Routes edit on the zone). Copy token. Account ID is on the dashboard sidebar.
2. Repo Settings -> Secrets and variables -> Actions: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. (BETTER_AUTH_SECRET stays a Worker secret set once via wrangler.)
3. `.github/workflows/deploy.yml`:
```yaml
name: deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: "**/package-lock.json" }
      - run: npm run install:all
      - run: npm test
      - run: npm run build
      - name: Apply D1 migrations
        working-directory: api
        run: npx wrangler d1 migrations apply penged --remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - name: Deploy
        working-directory: api
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```
GitHub Actions is free for public repos (2,000 min/mo on private free). Cloudflare Workers Builds (dashboard Git integration) is the no-YAML alternative; its free build minutes are limited.
