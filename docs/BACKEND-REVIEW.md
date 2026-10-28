# Backend review: /Users/axel/penged/api (read-only, 2026-10-28)

Scope: api/src/*.js against scrape/SPEC.md. `npx vitest run`: 33/33 pass (17 API incl. a concurrent doubles-accept race, 16 rating).
Rating math, guard/batch atomicity, the entity query builder, and upload validation are largely solid. Real issues are below, ranked.

## HIGH

### H1. Accepted challenges never close, so the challenger is locked out permanently
- functions.js:330-332 and 337 (one active challenge = status IN ('open','accepted')); functions.js:413 (syncLadder only expires `status='open'`); respondChallenge:363 sets 'accepted'. No code path ever moves 'accepted' to anything else (no completion on match verify, no expiry).
- Scenario: A challenges B, B accepts (status 'accepted'). A plays B, the match verifies. A tries to challenge again: 409 "You already have an active challenge." forever (until deleteAccount). The ladder's core mechanic dies after the first accepted challenge.
- Note SPEC lists `accepted` as a status but defines no "one active challenge" rule; the original UI only treats open+accepted as "yours" (appcode.js:4917). The lockout is created by this rule combined with no transition.
- Fix: give accepted challenges an expiry (e.g. expires_at reset to +7d on accept; syncLadder moves accepted past expiry to a terminal state such as 'expired'/'cancelled' without counting toward unanswered_challenges), and/or close the challenge when a verified match between the two players is created after acceptance. Alternatively drop 'accepted' from the single-active guard.

### H2. Admin takeover by pre-registering the admin's email
- auth.js:19 (`requireEmailVerification: false`), :32 (any signup with an ADMIN_EMAILS address gets role admin), :38-44 and :59-62 (promotion on session create / getUser by email string only).
- Scenario: ADMIN_EMAILS=boss@corp.com. Until the boss registers, anyone can sign up as boss@corp.com with their own password and becomes admin (can forfeit/dismiss challenges, i.e. move the ladder). Email ownership is never proven. If the boss registered first it is not exploitable, but there is no safeguard and no email verification.
- Fix: promote only when `emailVerified` is true (and add real verification or a one-time admin bootstrap), or seed the admin row via a migration/CLI and drop the promote-on-signup hooks. Also demotion is absent: removing an email from ADMIN_EMAILS leaves role='admin' in the DB (auth.js never resets it).

### H3. Password hashing will exceed the free-tier 10 ms CPU limit
- auth.js:16-25 uses Better Auth defaults. better-auth 1.7.14 -> @better-auth/utils password, workerd condition resolves to `password.node.mjs` = node:crypto scrypt N=16384, r=16, p=1, dkLen=64 (about 32 MB working memory, typically tens of ms CPU). Verified in node_modules/@better-auth/utils/dist/password.node.mjs and its package.json export map.
- Scenario: on Workers Free (10 ms CPU/request) sign-up, sign-in, and reset-password die with Error 1102 (CPU exceeded). Locally (wrangler dev/miniflare, tests) it works, so this will only show up in production. On Paid (30 s default CPU) it works but each login burns noticeable CPU and 32 MB.
- Fix: deploy on Workers Paid (document it), or supply `emailAndPassword.password.{hash,verify}` using WebCrypto PBKDF2 (native, CPU time is mostly off-thread; use >=100k iterations SHA-256, store `pbkdf2$iters$salt$hash`). Note PBKDF2 in WebCrypto is also capped at 100,000 iterations on Workers, so state that limit in the config. Do not lower scrypt N.

### H4. No effective rate limiting on login/register/reset (credential stuffing, signup spam, upload spam)
- Better Auth rate limiter is `enabled: options.rateLimit?.enabled ?? isProduction` where isProduction = `process.env.NODE_ENV === 'production'` (@better-auth/core/dist/env/env-impl.mjs:31-32, create-context.mjs:172). wrangler.toml sets no NODE_ENV, so on Workers it is OFF. Even if enabled: storage defaults to in-memory (per isolate, so useless across isolates) and the client IP is read from `x-forwarded-for` (core/utils/ip.mjs:196), which a client can prepend/spoof; Cloudflare's trustworthy header is `cf-connecting-ip`.
- Scenario: unlimited password guessing against /api/auth/sign-in/email; unlimited accounts; each hash costs real CPU (see H3), so it is also a cheap CPU/cost DoS.
- Fix: in getAuth set `rateLimit: { enabled: true, storage: 'database' }` (needs the rateLimit table) or use a Workers Rate Limiting binding / Cloudflare WAF rule on /api/auth/*; set `advanced.ipAddress.ipAddressHeaders: ['cf-connecting-ip']`. Also add a per-user limit on /api/uploads and the submitMatch/createChallenge functions.

## MEDIUM

### M1. Password-reset link (token) is only console.logged
- auth.js:21-24. There is no mail transport, so reset is unusable for real users in production, and the full reset URL (a bearer token granting account takeover for 1 h) is written to Worker logs, readable by anyone with log access (Workers Logs/tail/Logpush).
- Fix: send through an email API (Resend/MailChannels etc.) and never log the URL outside dev (`if (env.ENVIRONMENT==='dev')`). Token expiry (3600 s default, better-auth password.mjs:73) and single use (consumeVerificationValue, :163) are correct.
- Also set `revokeSessionsOnPasswordReset: true` (default false, utils/password.mjs:34) so a reset kicks out an attacker's existing sessions.

### M2. Deploy-config traps: insecure cookie and wrong origin if vars not overridden
- wrangler.toml:23-27 defaults `BETTER_AUTH_URL = "http://localhost:8787"`. Cookie `Secure` is derived from the baseURL scheme (cookies/index.mjs:23 and 34), so a production deploy that forgets the override gets non-Secure session cookies and a localhost CORS/trusted origin list. HttpOnly and SameSite=Lax are always set (cookies/index.mjs:35-37), which is good.
- Fix: set `advanced.useSecureCookies` true whenever the request is https (or always, outside local dev), and put localhost values in `[env.dev]`/.dev.vars only; throw if BETTER_AUTH_URL is localhost and the request host is not.

### M3. XP awarded on every challenge response, accept or decline, with no spec basis
- functions.js:366-370 gives the defender +5 xp for responding (accept OR decline). SPEC XP rules are only +25 played, +25 win, +5 per game won (max 5). Two cooperating accounts (challenge, decline, repeat) farm XP/levels; a declined challenge costs nothing. If this came from the original, it is not in SPEC; otherwise remove.
- Fix: delete the XP block (also removes a version-guarded player write per response).

### M4. A submitter cannot withdraw or dispute their own submission; pending matches can only expire
- functions.js:292 rejects any decision from someone already in `accepted_user_ids`, and the submitter is auto-accepted (:217). The `cancelled` status exists (schema, migration CHECK) but no function sets it. A typo'd score stays pending for 7 days and, if the opponent accepts it, becomes a verified, rating-moving, ladder-swapping result that the submitter can no longer contest.
- Fix: let the submitter `cancel` while pending (or allow decline/dispute by any participant regardless of prior accept; a prior accept then can still be reversed until all accept).

### M5. syncLadder rewrites every player row on every call
- functions.js:85-93, 415: `flagsStmt` is an UPDATE of ALL players with correlated sub-selects (plus json_each over disputed matches), executed on every call by any signed-in user (the Challenges page load). Each call counts all rows as D1 writes (free tier 100k rows written/day: ~50 players x 2000 page loads) and runs unconditionally even when nothing changed.
- Fix: restrict `WHERE unanswered_challenges <> (...) OR under_review <> (...)`, or only recompute for players whose challenges/matches just changed; skip the batch when nothing expired and compact is empty; add a short cache (meta timestamp) so it runs at most once a minute.

### M6. "Six meetings" boundary and doubles "meeting" definition are unspecified and arguable
- rating.js:28 zeroes a win only when `earlierMeetings >= 6`, i.e. the 7th match. SPEC: "six meetings in six months -> a win pays nothing". If "meetings" includes the current match, the 6th should pay nothing (earlier >= 5); at 5 earlier the factor is still 0.21. Pick one and test it.
- functions.js:240-249 (doubles): a prior match counts as a meeting if the player faced ANY of today's opponents, regardless of partner; the window is 180 days, not calendar six months. Reasonable, but document it. The loser's loss is also scaled by repeatFactor (rating.js:31), which follows the SPEC formula literally; confirm intended.
- Note the SPEC flags the "halves the gain" copy contradiction; code uses 1/(1+0.75n) per the formula (rating.js:19-21), consistent with the rule text.

## LOW / INFO

- L1. Avatar URL: any http(s) URL is accepted (functions.js:40-43). Allows third-party tracking pixels (viewer IPs leak to an arbitrary host) and plain-http mixed content. `/api/files/` prefix check can be bypassed with `/api/files/%2e%2e/...` (browsers normalise %2e%2e), pointing the <img> at any same-origin GET; harmless for images but sloppy. Fix: only allow `/api/files/<uuid>.<ext>` via the same regex used at uploads.js:43, or https only plus a proxy.
- L2. Uploads are never deleted: replacing an avatar or deleteAccount (functions.js:421-440) leaves the R2 object orphaned, and any registered user can upload 2 MB unlimited times (no quota/rate limit). Fix: store owner in R2 customMetadata, delete the old object on avatar change/account deletion, and cap uploads per user. Validation itself is good: client MIME allow-list, magic-byte sniff, extension taken from the sniff, random UUID key (no traversal), strict key regex on read, nosniff, no SVG.
- L3. CSRF relies only on SameSite=Lax. `/functions/*` parses the body as JSON regardless of Content-Type (functions.js:450-457) and neither /functions nor /uploads checks Origin. Lax blocks cross-site POST cookies today; add an Origin/Sec-Fetch-Site check (reject cross-site) or require `Content-Type: application/json` for defence in depth. CORS itself is correctly allow-listed with credentials.
- L4. Public read of Player/Match/Challenge exposes `user_id`, `created_by_id`, all_user_ids, challenge messages (app.js entities mounted without auth; consistent with SPEC `public_without_login`). No email, password hash, token, or session is reachable: `User` is not in ENTITIES (404 via getDef), output is whitelisted by `pub()`, `version` is never exposed. Just be aware user_ids are stable identifiers.
- L5. deleteAccount (functions.js:421-440) keeps verified/expired/declined/disputed matches and challenges containing the user's user_id, username, display_name, avatar_url (JSON snapshots) and leaves their avatar in R2. Acceptable for ladder history, but should be disclosed or anonymised ("Deleted player") if "delete" must mean delete. Session, account and user rows ARE removed in the same batch, as are open/accepted challenges and pending matches; ranks are compacted.
- L6. submitMatch lets any player name any other players, with no limit on outstanding pending matches per submitter (functions.js:185-222): harassment/spam of an opponent's inbox for 7 days. Add a cap on pending submissions per user, e.g. 5.
- L7. validateGames (rating.js:80) does not enforce a best-of: 5-0 with five games, or games played after a side already clinched, are accepted and pay up to 5 games of XP. Only matters if the original enforced a best-of-3/5 format.
- L8. `Math.round` on a negative half (e.g. -x.5) rounds toward +inf (rating.js:32), a 1-point asymmetry between win and loss at exact halves. Harmless.

## Verified OK (checked in code)
- Elo, expected score, K thresholds (<10:48, <30:32, else 24), +-45 cap, 700 floor, repeatFactor, zero-gain rule, doubles team-average rating with per-player K and floor applied per individual (rating.js:9-63).
- XP +25/+25/+5 per game won, max 5; level = floor(sqrt(xp/40))+1 (rating.js:65-71).
- Verification only when every `all_user_ids` entry accepted (functions.js:297); decline/dispute update status only, no rating writes (:306-309); expired matches rejected (:291).
- Atomicity: ratings, wins/losses, xp, rank swap and match status go in ONE `DB.batch` (functions.js:299-311) led by `guardRow` version/status guards and `guardLadder`; failed CHECK rolls back, `retrying` recomputes up to 5 times then 409. Two concurrent final accepts verify exactly once (test covers); re-verification is blocked by the `status='pending'` guard. Ladder swap implementation (rating.js:114-124) correct, singles only; doubles never move the ladder.
- Challenge rules: gap 1-3 ranks above (:328-329), 72 h window (:14), expiry in syncLadder, forfeit moves ladder only and requires admin, `request` only by the challenger, only on `expired` challenges (:383-390). Only the defender can respond (:356).
- Authz: every function requires a session (functions.js:447-448); updatePlayer/createPlayer/deleteAccount act only on the caller's own player; respondMatch requires membership in all_user_ids (:288); role cannot be set at signup (`input:false`).
- Query builder (entities.js): entity name, filter field and sort field are all validated against `Object.hasOwn` whitelists before being interpolated (quoted); every value is bound; operators whitelisted; `json` columns not filterable; `$in` capped at 100; limit capped at 500. No SQL injection found.
- Cookie: HttpOnly, SameSite=Lax, Secure when baseURL is https. Missing BETTER_AUTH_SECRET throws (create-context.mjs validateSecret). `.dev.vars` is gitignored (api/.gitignore).
- No Node-only APIs in src beyond Better Auth's node:crypto (needs the already-set `nodejs_compat`).
