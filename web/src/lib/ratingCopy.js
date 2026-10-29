// Every rating rule as shown to players (Home "How ratings work" + /rules). Plain module so api/test/explainer.test.js can
// assert each quoted number against api/src/rating.js constants and the real rating code.

export const SEPARATE_RATINGS =
  "Singles and doubles are two separate ratings and ladders — a doubles result never moves your singles rating, and vice versa. Each has its own confidence, rematch history, time away, streaks and rank. Overall is just a blend of the two for the Overall board.";

export const RATING_POINTS = [
  SEPARATE_RATINGS,
  "Everyone starts at 1400. No rating ever drops below 100, so there is a long way down to the Dirt.",
  "Bounties: what beating someone is worth to you, on top of the normal result, and it comes straight out of their rating. Three kinds stack. The top 3 carry one for anyone ranked below them (#1 12 rating and 50 xp, #2 9 and 35, #3 6 and 25, plus 2 rating and 5 xp for every extra place between you, up to +10 and +30), so chasing the top pays most from the bottom. Anyone on a 3+ win streak carries one for everybody, #1 included (3 rating and 10 xp per win past 2, up to 15 and 50). Anyone up 50+ rating in the last 7 days carries one too (1 rating per 10 points risen, up to 12; 1 xp per 2, up to 40). At most 30 rating and 120 xp. You can claim the same player's bounty once a week; in doubles the winners split the rating and each get the xp. Bounties show next to names when you pick someone to record or challenge.",
  "Only Ranked matches move ratings. Record a match as Unranked to just play for XP: ratings, records, streaks, rematch counts and challenges stay as they are.",
  "Every game counts. Each game in a match is rated on its own, in order — a 3-0 sweep earns three wins, a 2-1 grind earns two wins and a loss.",
  "Confidence: the ladder also tracks how sure it is about your rating (±200 when you are brand new, never tighter than ±50). The less sure it is, the more each result moves you, so new players find their level fast and settled regulars move steadily.",
  "Every game you play firms your confidence up. Time away loosens it: a settled ±50 is back to ±76 after 30 days and ±95 after 60, so returning players move fast again until they settle. Your profile shows \"settling ±N\" while it is ±90 or wider.",
  "Your opponent's confidence matters too: a result against someone still settling tells the ladder less about you, so it moves you a little less (and a brand-new player's win barely dents a regular).",
  "Margins matter. Win a game 11-2 and you gain far more than winning it 11-9 — up to double (margin ×0.75 to ×2.0).",
  "Playing up always means growth. Lose to someone rated 100+ above you but keep it close, taking more of the points than the gap says you should (about 46% against someone 100 above, 39% at 300, 35% at 450), and the loss turns into a gain: 150 rating for every whole share of points above that mark, at most +15. The winner pays the same, so a top player who lets you get close drops even though they won. Get beaten clearly and it is an ordinary loss: you still have to prove it. Rematches earn less of it, like everything else.",
  "Upsets pay. Beat someone rated above you and the win is boosted (up to ×1.6); crushing someone far below you is damped (down to ×0.6).",
  "You lose points the same way you win them. Get crushed in a game and you lose big; lose narrowly to someone better and it barely stings. Between two equally settled players in singles, what the winner gains the loser drops.",
  "One game moves you at most 40 points, and one match (all its games together) at most 80.",
  "Rematches count, just a little less, and the effect fades fast. Each recent match against the same opponent shrinks the swing, but it halves every 3 days: play the same person every day and results count about half (×0.48), weekly ×0.89, after a few weeks off fully. Never below ×0.30, so regulars keep moving.",
  "New rivals count more. Your first match against someone in 30+ days (or ever) is fresh evidence: ×1.1 and +10 xp. Playing around the office is the fastest way to find your real level.",
  "Games to 21 count 30% more than games to 11: a longer game is a truer result, so a short one swings less. An accepted challenge counts ×1.25.",
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
  "to21      = 1.3 for games to 21      challenge = 1.25 for an accepted challenge\n" +
  "partner   = doubles: 0.75 to 1.25 (stronger partner gains less, loses more)\n" +
  "match total = sum of its games, never more than 80; rating never below 100";

export const WORKED_EXAMPLE =
  "Two regulars (confidence ±60, last played 3 days ago, free paddles): 1400 beats 1600. A 3-0 blowout (11-2, 11-3, 11-1) is three wins: +19, +17, +17 = +53, and the loser drops 53. The same match played narrowly (11-9, 9-11, 12-10) is two wins and a loss: +12, −4, +12 = +20. With a paid paddle the blowout is +48 for the winner. Between two evenly rated regulars (1400 each), a 3-0 sweep is +27, a 2-1 grind +6, a close 2-0 +14. Back after 45 days away the same grind is worth +12, after 90 days +17. A brand-new player (±200) who beats a regular 2-1 gains +40 while the regular drops only 5. What's on the line for two equal regulars: +8 to +21 against a new rival, +6 to +17 if you meet weekly, +3 to +9 if you play every day, and +11 to +34 for the one coming back from six weeks off. Rank simply follows rating.";

export const XP_POINTS = [
  "+25 xp for playing, +25 for winning",
  "Took a shot: +15 xp for losing to someone rated 100+ above you",
  "Bounty: up to +120 xp for taking down a top-3 player, a hot streak or a fast riser in a ranked match",
  "+5 xp per game you take (five games max)",
  "Upset: +10 xp per full 50 rating points you were behind (max +60)",
  "Streak: +10 xp x (wins in a row - 1) from your second straight win in the format you are playing (max +50)",
  "Skunk: +15 xp for every game you win 11-0",
  "Comeback: +15 xp for winning after losing game 1",
  "First verified match of the day: +10 xp",
  "New rival: +10 xp for your first verified match against someone in that format, or the first in 30+ days",
];

export const CHALLENGE_POINTS = [
  "Anyone on the singles ladder can challenge anyone else on it, at any rank (your first ranked singles match puts you on the ladder). One open singles challenge at a time.",
  "Weekly limits: you can send 3 challenges and receive 2 in any 7 days, singles and doubles together.",
  "The defender has 72 hours to accept, and accepted challenges have 72 hours to be played. Weekends don't count: the clock pauses all of Saturday and Sunday in each player's own time zone (if you live in different cities, it runs only while it is a weekday for both of you). Ducking a challenge costs rating, and rank follows rating.",
  "Challenged by someone rated below you: declining costs you rating. No answer in 72 weekday hours costs twice as much, and the challenger gains the same points as a walkover and earns 15 xp.",
  "Challenged by someone rated above you: declining or not answering costs half the usual amount, with no walkover. Before you decline you see what a close loss would earn you: often it is a gain.",
  "The cost peaks when you are evenly rated and close in rank, and is larger while your rating is still settling (up to 24 for silence between equals, 12 at ±50 confidence). It shrinks with the rank gap: ×1 one place apart, ×0.8 two, ×0.6 three, ×0.4 four or five, ×0.25 six or more. Ducking someone far away costs little (at least 5 for silence, 3 for a decline). Rematches cost less. The higher you are rated, the more any duck costs you: ×1 at 1400 or below, rising to ×2 at 1800 and up, so the top of the ladder can't hide.",
  "Every duck counts: there is no weekly limit on ducking penalties. The weekly challenge limits (3 sent, 2 received) are what stop anyone farming you.",
  "Played that challenger in the last 7 days? Declining is free. Played 3 or more matches this week? A decline costs half.",
  "After a decline or no answer, the same challenger cannot challenge you again for 7 days.",
  "Penalised unfairly? Ask for a review; an admin can reverse it and give back your rating.",
  "An accepted challenge that never gets played expires with no penalty.",
  "Doubles challenges: pick a partner and two opponents, anyone with a profile. Your partner and both opponents all have to accept; one no closes it. Nobody loses rating for declining or ignoring a doubles challenge. Played as challenged, it counts ×1.25 like a singles one.",
];

export const MATCHUP_POINTS = [
  "Every Monday at midnight (Chicago time) everyone on the singles ladder gets one matched opponent for the week. Your first ranked singles match puts you in. Nobody sits out unless they are the only one on the ladder.",
  "Who you get: the player you most need to play. Never played them: +100. Otherwise +1 for every day since you last met, counting at most 60 days. Each ducked singles challenge between you in the last 90 days, either way round: +25 (up to 4 count). The top of the ladder pulls: +30 for #1, 24 for #2, 18 for #3, 12 for #4, 6 for #5. Last week's pick again: −40. How close your ratings are never counts: the point is to play across the board.",
  "It's a mystery match: you don't see who it is until you accept. Before that you only see your max win, your max loss and the deadline. Nobody else sees who you got either, and they don't see you on their list until you accept.",
  "Max win is a dominant 2-0 win, played as a challenge (×1.25), bounties included. Your max win is always bigger than your max loss: your loss in the matched game is softened so it is at most 75% of the max win (a loss is scaled by min(1, 0.75 × max win ÷ the full loss)). If a win is worth +1 or less for you, nothing is at stake: no max loss. Both numbers are fixed on Monday.",
  "Accept and you see who it is, and the challenge goes to them. It skips the weekly limits, the one-open-challenge rule and the 7-day cooldown, and it doesn't use up anyone's weekly limits. Lose the matched game and your loss is softened as above; win it and it counts as normal. The other player's result is never softened.",
  "Decline and you lose your max loss (at most 80) right away, without finding out who it was. That settles your week.",
  "Once you accept you can't back out without losing 2x your max loss (at most 80).",
  "Ignore it, or accept and not play it by Sunday night, and you lose your max loss (at most 80) at the end of the week. If you accepted and they decline it, ignore it or haven't answered by the end of the week, you owe nothing.",
  "A matched challenge you receive is a regular challenge for you: decline it or let it run out and the normal penalties apply. Several people can be matched with the same player, so #1 may have a queue.",
  "Any verified ranked singles match between you two that week counts. Matched with each other? One match covers you both.",
];
