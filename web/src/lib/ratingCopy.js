// Every rating rule as shown to players (Home "How ratings work" + /rules). Plain module so api/test/explainer.test.js can
// assert each quoted number against api/src/rating.js constants and the real rating code.

export const SEPARATE_RATINGS =
  "Singles and doubles are two separate ratings and ladders — a doubles result never moves your singles rating, and vice versa. Each has its own confidence, rematch history, time away, streaks and rank. Overall is just a blend of the two for the Overall board.";

export const RATING_POINTS = [
  SEPARATE_RATINGS,
  "Everyone starts at 1400. No rating ever drops below 700.",
  "Every game counts. Each game in a match is rated on its own, in order — a 3-0 sweep earns three wins, a 2-1 grind earns two wins and a loss.",
  "Confidence: the ladder also tracks how sure it is about your rating (±200 when you are brand new, never tighter than ±50). The less sure it is, the more each result moves you, so new players find their level fast and settled regulars move steadily.",
  "Every game you play firms your confidence up. Time away loosens it: a settled ±50 is back to ±76 after 30 days and ±95 after 60, so returning players move fast again until they settle. Your profile shows \"settling ±N\" while it is ±90 or wider.",
  "Your opponent's confidence matters too: a result against someone still settling tells the ladder less about you, so it moves you a little less (and a brand-new player's win barely dents a regular).",
  "Margins matter. Win a game 11-2 and you gain far more than winning it 11-9 — up to double (margin ×0.75 to ×2.0).",
  "Upsets pay. Beat someone rated above you and the win is boosted (up to ×1.6); crushing someone far below you is damped (down to ×0.6).",
  "You lose points the same way you win them. Get crushed in a game and you lose big; lose narrowly to someone better and it barely stings. Between two equally settled players in singles, what the winner gains the loser drops.",
  "One game moves you at most 40 points, and one match (all its games together) at most 80.",
  "Rematches count, just a little less, and the effect fades fast. Each recent match against the same opponent shrinks the swing, but it halves every 3 days: play the same person every day and results count about half (×0.48), weekly ×0.89, after a few weeks off fully. Never below ×0.30, so regulars keep moving.",
  "New rivals count more. Your first match against someone in 30+ days (or ever) is fresh evidence: ×1.1 and +10 xp. Playing around the office is the fastest way to find your real level.",
  "Games to 21 count 10% more than games to 11. An accepted challenge counts ×1.25.",
  "Paddles count. A paid paddle is treated as +50 rating when working out who was expected to win: win with one and you gain a little less, beat one and you gain a little more.",
  "Doubles uses each team's average rating and combined confidence; each player then moves by their own confidence, and a stronger partner gains a little less and loses a little more (×0.75 to ×1.25).",
  "No streak bonus. A real improvement shows up as wins you were not expected to get, and each one counts in full. (Glicko-2 also tracks a volatility, starting at 0.06, but at office scale it barely moves.)",
  "See what's on the line before you play. Record a match, To confirm and Challenges show your range — from a narrow 2-1 (11-9, 9-11, 11-9) to a dominant 2-0 (11-4, 11-5) — for a win and for a loss, and the tier it would take you to.",
  "Records show both: Matches (match wins and losses) and Games (every game you won and lost).",
];

export const RATING_FORMULA =
  "Glicko-2, one game at a time, in order (game 2 starts from what game 1 left):\n\n" +
  "confidence RD   200 brand new, at least 50, max 200\n" +
  "time away       RD = sqrt(RD^2 + (0.06 x 173.7)^2 x days)   (before game 1)\n" +
  "edge            = 50 * share of paid paddles on your side  (0, 25 or 50)\n" +
  "g(opp RD)       = 1 / sqrt(1 + 3 * (oppRD / 173.7)^2 / pi^2)\n" +
  "expected        = 1 / (1 + e ^ (-g * ((you + edge) - (opp + their edge)) / 173.7))\n" +
  "new RD          1 / RD'^2 = 1 / RD^2 + to21 * repeat * g^2 * expected * (1 - expected) / 173.7^2\n" +
  "change          = 0.6 * RD'^2 / 173.7 * g * (result - expected)\n" +
  "                  * margin * upset * repeat * new rival * to21 * partner * challenge   (max 40 per game)\n\n" +
  "result    = 1 for a win, 0 for a loss (the loser gets the same margin and upset factors)\n" +
  "dominance = (winnerPoints - loserPoints) / (winnerPoints + loserPoints)   of THAT game\n" +
  "margin    = 0.75 + 1.25 * sqrt(dominance)          (0.75 to 2.0)\n" +
  "upset     = 2.2 / (2.2 + 0.001 * (winner - loser))   (0.6 to 1.6, edges included)\n" +
  "repeat    = 0.3 + 0.7 / (1 + 0.75 * meetings)     meetings = sum of 0.5 ^ (days ago / 3)\n" +
  "new rival = 1.1 if you have not met these opponents in 30 days, else 1\n" +
  "to21      = 1.1 for games to 21      challenge = 1.25 for an accepted challenge\n" +
  "partner   = doubles: 0.75 to 1.25 (stronger partner gains less, loses more)\n" +
  "match total = sum of its games, never more than 80; rating never below 700";

export const WORKED_EXAMPLE =
  "Two regulars (confidence ±60, last played 3 days ago, free paddles): 1400 beats 1600. A 3-0 blowout (11-2, 11-3, 11-1) is three wins: +19, +17, +17 = +53, and the loser drops 53. The same match played narrowly (11-9, 9-11, 12-10) is two wins and a loss: +12, −4, +12 = +20. With a paid paddle the blowout is +48 for the winner. Between two evenly rated regulars (1400 each), a 3-0 sweep is +27, a 2-1 grind +6, a close 2-0 +14. Back after 45 days away the same grind is worth +12, after 90 days +17. A brand-new player (±200) who beats a regular 2-1 gains +40 while the regular drops only 5. What's on the line for two equal regulars: +8 to +21 against a new rival, +6 to +17 if you meet weekly, +3 to +9 if you play every day, and +11 to +34 for the one coming back from six weeks off. Rank simply follows rating.";

export const XP_POINTS = [
  "+25 xp for playing, +25 for winning",
  "+5 xp per game you take (five games max)",
  "Upset: +10 xp per full 50 rating points you were behind (max +60)",
  "Streak: +10 xp x (wins in a row - 1) from your second straight win in the format you are playing (max +50)",
  "Skunk: +15 xp for every game you win 11-0",
  "Comeback: +15 xp for winning after losing game 1",
  "First verified match of the day: +10 xp",
  "New rival: +10 xp for your first verified match against someone in that format, or the first in 30+ days",
];

export const CHALLENGE_POINTS = [
  "Challenges are singles-only: you can challenge a player up to three singles ranks above you. One open challenge at a time.",
  "The defender has 72 hours to accept. Ducking a challenge costs rating, and rank follows rating.",
  "Decline: the defender loses rating.",
  "No answer in 72 hours: the defender loses twice as much, the challenger gains the same points as a walkover and earns 15 xp.",
  "The cost peaks when you are evenly rated and close in rank, and is larger while your rating is still settling (up to 24 for silence between equals, 12 at ±50 confidence). Ducking someone far below you costs little (at least 5 for silence, 3 for a decline). Rematches cost less.",
  "Played that challenger in the last 7 days? Declining is free. Played 3 or more matches this week? A decline costs half.",
  "After a decline or no answer, the same challenger cannot challenge you again for 7 days.",
  "Penalised unfairly? Ask for a review; an admin can reverse it and give back your rating.",
  "An accepted challenge that never gets played expires with no penalty.",
];
