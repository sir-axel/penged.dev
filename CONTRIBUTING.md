# Contributing to Penged.dev

Thanks for helping out. Penged.dev is a workplace ping-pong ladder: record a match, every player signs off, and ratings, tiers and ranks move only on verified results. It runs entirely on Cloudflare's free tier.

## Getting started

You need Node 20+ and git. No Cloudflare account is required for local development — wrangler emulates D1 locally.

```bash
git clone https://github.com/sir-axel/penged.dev.git
cd penged.dev
npm run install:all                      # installs web/ and api/
cp api/.dev.vars.example api/.dev.vars   # set BETTER_AUTH_SECRET (openssl rand -base64 32)
echo 'BETTER_AUTH_URL=http://localhost:8787' >> api/.dev.vars
npm run dev                              # builds web, applies migrations locally, serves on :8787
npm --prefix api run seed                # optional demo data (login: demo@penged.test / demo1234demo)
```

Open http://localhost:8787. For UI hot reload, keep `npm --prefix api run dev` running and start `npm run dev:web` (Vite on :5173). Emails are printed to the server console locally instead of being sent.

## Where things live

```
web/src/pages/        one file per route (Feed, Leaderboard, NewMatch, Chat, ...)
web/src/components/   shared UI (Layout, BackButton, TierBadge, chat/, feed/, match/, ui/)
web/src/lib/          client helpers (ladder.js, tiers.js, feedChips.js, ratingFactors.js)
api/src/rating.js     the rating system: pure functions, every constant in one CONSTANTS block
api/src/functions.js  server actions (submitMatch, respondMatch, challenges, ...)
api/src/chat.js       forum, General room, DMs, mentions, reports
api/src/entities.js   read-only public entity endpoints (whitelisted fields only)
api/migrations/       D1 SQL migrations, applied in numeric order
api/test/             vitest suites (unit + integration against local D1)
api/scripts/          seed, make-admin, and simulate.js (rating simulation)
```

## Making a change

1. Open an issue (or comment on one) for anything bigger than a small fix, so we can agree on the approach first.
2. Fork, create a branch off `main`, and keep the pull request focused on one change.
3. Match the surrounding code: same naming, comment density and the existing pixel visual style (tokens live in `web/src/index.css`).
4. Make sure these pass before opening the PR:
   ```bash
   npm test         # all api/ tests
   npm run build    # web build
   ```
5. Check your change on a phone-sized window (360–390px): no horizontal scroll, tap targets at least 40px, inputs at least 16px.
6. Open the pull request against `main` and describe what changed and how you tested it. Screenshots help for UI changes.

### Rules of thumb

- **Database changes** go in a new numbered file in `api/migrations/` — never edit a migration that has already shipped. Migrations must be safe on existing data.
- **Rating changes** belong in `api/src/rating.js` with tests. If you change a constant, run `node api/scripts/simulate.js` and include the before/after table in the PR, and update the rules copy in `web/src/components/home/RatingExplainer.jsx`.
- **Privacy**: anything private (feedback, DMs, emails) must never be readable through the entity endpoints. Add a test when you touch auth or data access.
- **Free tier**: avoid per-request heavy CPU work (the free plan allows ~10 ms CPU per request) and chatty polling.
- **No secrets in git.** Local secrets go in `api/.dev.vars` (gitignored); production secrets are set with `wrangler secret put` by the maintainer.

## Deploys

Merging to `main` does not deploy. The maintainer deploys penged.dev manually after review.

## Feedback without code

Not a coder? Use the Feedback page on https://penged.dev or open a GitHub issue.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
