# Penged.dev — rebuild spec (scraped from Base44, 2026-10-28)

Source: https://primitive-peak-ping-play.base44.app · Base44 app id `6ae21c4a201480439351f37f`
Public setting: `public_without_login` (anonymous reads allowed for Player/Match/Challenge).

## What's in this folder
| Path | What |
|---|---|
| `index.html`, `manifest.json`, `headers.txt` | Original shell, PWA manifest, response headers |
| `assets/index-BPPO09qq.js`, `assets/index-Bm7vdhr1.css` | Original minified bundle (no sourcemap is served) |
| `app.pretty.js` / `app.pretty.css` | Prettified bundle |
| `appcode.js` | **App-only code** (bundle lines 23820–31507): every page, component and API call; the rest is React/router/Radix/Base44 SDK |
| `render/*.png` | Full-page screenshots, desktop 1440 + mobile 390@2x, every route |
| `render/*.desktop.txt/.html` | Rendered text + DOM per route |
| `render/api-calls.*.txt` | Every API request the pages make |
| `media/logo.png` | 1024² app icon |

## Stack observed
Vite + React 18 + react-router v6 + TanStack Query + Tailwind + shadcn/Radix UI + lucide icons, `@base44/sdk`.
Fonts (Google): Silkscreen (display), Chakra Petch (heading), Inter (body), IBM Plex Mono (mono).
Strip in rebuild: Base44 XHR token shim, `/api/app-logs/...` page tracking, `analytics/track/batch`, `badge.js` ("Edit with Base44").

## Routes
Public: `/` home · `/leaderboard` · `/matches` · `/matches/:id` · `/players/:username` · `/rules`
Auth required: `/welcome` (claim username; one step) · and, once a Player exists: `/matches/new` · `/challenges` · `/profile` · `/admin/reviews` (role=admin)
Auth pages: `/login` (Google + email/password) · `/register` · `/forgot-password` · `/reset-password` · `*` 404

## Entities (Base44 adds id, created_date, updated_date, created_by_id)
**User** (built-in auth): id, email, role (`admin` | user)

**Player** (confirmed from live record):
user_id, username, username_lower, display_name, avatar_url, bio,
singles_rating (1400), doubles_rating (1400), singles_rank,
singles_wins, singles_losses, doubles_wins, doubles_losses,
xp, level, unanswered_challenges, under_review (bool), last_active_at

**Match** (inferred from UI): format (`singles`|`doubles`), target (11|21),
side_a / side_b: `[{player_id, paddle}]`, games: `[{a, b}]`, games_a, games_b, winner_side,
status (`pending`|`verified`|`declined`|`disputed`|`expired`|`cancelled`),
all_player_ids, all_user_ids, accepted_user_ids, submitted_by_name, rating_changes, expires_at

**Challenge** (inferred): challenger_user_id, challenger_player_id, challenger_name, challenger_rank,
defender_user_id, defender_player_id, defender_name, defender_rank, message (≤200),
status (`open`|`accepted`|`declined`|`expired`|`forfeited`|`cancelled`), review_requested, expires_at

Queries used: Player list sort `singles_rank`, filter `username_lower`, `singles_rank {$gte,$lte}`;
Match filter `status`, `all_player_ids`, sort `-created_date`; Challenge list/filter `status=expired`.

## Backend functions (server code is NOT downloadable from the public site — logic below is inferred)
| Function | Payload | Behaviour |
|---|---|---|
| `createPlayer` | `{username, display_name, avatar_url}` | create Player for current user; unique username_lower; rating 1400; assign bottom rank |
| `updatePlayer` | `{username?, display_name?, bio?, avatar_url?}` | edit own profile |
| `submitMatch` | `{format, target, side_a, side_b, games:[{a,b}]}` | create `pending` match; submitter auto-accepts; returns `{match}` |
| `respondMatch` | `{match_id, decision: accept\|decline\|dispute}` | when every participant has accepted → `verified`, apply Elo + XP + ladder swap |
| `createChallenge` | `{defender_player_id, message}` | only players 1–3 ranks above you; 72h window |
| `respondChallenge` | `{challenge_id, decision: accept\|decline}` | |
| `resolveChallenge` | `{challenge_id, action: request\|forfeit\|dismiss}` | challenger requests review of an expired challenge; admin forfeits (moves ladder position only, no rating change) or dismisses |
| `syncLadder` | `{}` | run on Challenges page load: expire overdue challenges/matches, recompute ranks |
| `deleteAccount` | `{confirm: "DELETE"}` | delete user + player |
| `Core.UploadPublicFile` | `file` | avatar upload → `{file_url}` |

## Rules (verbatim from the Rules page / bundle)
- Everyone starts at 1400. Elo: `expected = 1/(1+10^((opp-you)/400))`, `new = you + K*(result-expected)*repeatFactor`
- K = 48 (first 10 matches) / 32 (until 30) / 24 after. Max ±45 per result, floor 700.
- `repeatFactor = 1/(1+0.75*earlier meetings)`; six meetings in six months → a win pays nothing.
  ⚠ The UI copy also says each earlier meeting "halves the gain", which contradicts the formula. Pick one.
- Margins don't matter. Doubles: all four sign off. Beating a higher-ranked player takes their ladder spot.
- XP: +25 played, +25 win, +5 per game won (max 5 games). `level = floor(sqrt(xp/40))+1`.
- Overall rating shown = games-weighted mean of singles/doubles rating.

## Design tokens (light; `.dark` variant also exists in app.pretty.css)
background 0 0% 94% · foreground 0 0% 5% · card #fff · border 0 0% 74% · brand/ring/success 148 46% 26% (green)
brand-soft 148 38% 92% · warning 32 78% 31% · destructive 4 66% 39% · radius 0.25rem · pixel-frame card style
