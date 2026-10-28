# Penged visual QA: original (Base44) vs rebuild

Method: side-by-side composites (sbs-*.png, sbsm-*.png), pixel diff on rules, className-set diff and backtick-string diff of web/src vs scrape/appcode.js (scripts: cls.py, copy2.py, strings.py; outputs cls-missing.txt, copy-missing.txt). Snapshot of verify/ PNGs is in snap/.

## Verdict
The rebuild is a near-literal port. Of 365 distinct className strings in appcode.js, only 44 are absent from web/src and all of those are template-literal fragments, the Google button/divider, Base44 error/"Access Restricted"/"Admin Note" screens, or the OTP step. Of the string literals, the only user-facing copy absent from web/src is the Google button, the "Verify your email" OTP screen (appcode.js:7103-7178) and the generic Base44 "Access Restricted" / "Admin Note" dialogs. Rules page is pixel-identical to the original except for the Base44 badge area. 404, forgot-password, rules, matches, leaderboard, home are visually identical aside from live data.

## P1 (verify first)
1. MOBILE bottom nav labels missing in every rebuild mobile screenshot (home, leaderboard, player, welcome). Original shows icon + "LADDER / RECORD / CHALLENGES" labels (appcode.js:477-486, `font-display text-[0.5rem] uppercase tracking-[0.12em]`); rebuild shows icons only, vertically centered. Current source web/src/components/Layout.jsx:84-91 DOES render `{short}` and dist CSS contains `text-[0.5rem]`, so the screenshots are probably stale (taken before the last edit at 12:28). Action: re-shoot verify/*.mobile.png; if labels are still absent, inspect computed color/overflow of that `<a>` (labels are `NavLink` children after `<Icon/>`).
2. verify/ is incomplete while being regenerated (mobile PNGs missing for several routes at time of review: challenges, profile, matches-new, welcome). I could only compare mobile for home, leaderboard, matches, player, rules, login, register, forgot-password, 404.

## P2 (behavioral difference, likely intentional, confirm)
3. Register: original has a post-signup "Verify your email" 6-digit OTP step (appcode.js:7095-7178: "We sent a code to ...", "Invalid verification code", "Verifying...", "Didn't receive the code?", "Code sent", "Check your email for the new code.", "Failed to resend code", "Resend"). Rebuild skips it and signs in directly (web/src/pages/Register.jsx:42 comment). Not a visual gap; just record it as a conscious deviation.
4. Layout consequence of removing Google: on /login and /register the card sits ~60px (login) / ~60px (register, original top-aligned because it overflowed 900px) lower/higher than the original because the Google button + "OR" divider (~74px) are gone and the shell vertically centers (web/src/components/auth/AuthShell.jsx). Expected; no fix needed. Register mobile height 1688 vs original 1748 for the same reason.

## P3 (data-only differences, not bugs)
- Original home/leaderboard/player show a single user "xim" with a photo avatar and bio "peng disciple" (Player.jsx:107 renders bio correctly); rebuild shows seeded users (initial-box avatars) and a hero card "GAME 3 / 2-1 / CONFIRMED BY ALL PLAYERS" vs original empty state "WARMING UP / 00-00 / WAITING ON THE FIRST RESULT" (components/home/HeroMatchCard.jsx:44 matches appcode). Ball-strip dot x-position differs = animation phase.
- Original /challenges, /matches/new, /profile screenshots are just the login redirect (unauthenticated), so those pages were compared against appcode.js only: copy and classes match (NewMatch.jsx, Challenges.jsx, Profile.jsx, Welcome.jsx, AdminReviews.jsx, MatchDetail.jsx, ResetPassword.jsx all have zero missing strings; sticky submit bar `fixed inset-x-0 bottom-[58px] ... md:bottom-0` is present; in the full-page PNG it overlaps the "Add game" button only because fixed elements are captured mid-page, not a layout bug).

## No discrepancies found (>4px) on
home (desktop), leaderboard, matches (empty-state structure visible in original, rebuild only shows data state: not comparable), player, rules, login, register, forgot-password, reset-password (invalid-link copy matches appcode.js:7591), 404, match detail, profile, welcome, admin reviews.

## Nothing to fix in file:line terms beyond item 1
Layout.jsx:84-91 (nav labels) is the only candidate; re-screenshot to confirm before editing.
