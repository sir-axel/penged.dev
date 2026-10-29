import { TIERS } from "@/lib/tiers";

// Pixel emblems, one per tier, a ping-pong climb: bare wooden blade, net, ball, paddle, trophy, shield, gem, crown, flaming ball.
// '#' = tier colour, '+' = tier edge colour, 'o' = highlight, 'x' = shade, '.' = empty. 12x12.
// Grandmaster sits on a solid red tile, so it gets its own palette: white ball, orange and yellow flames.
const GM = { "#": "#ffffff", x: "#d6d3d1", "+": "#f97316", o: "#fde047" };
const ART = {
  wood: [
    "...######...",
    "..##x#####..",
    ".####x#####.",
    ".#x###x####.",
    ".##x###x###.",
    ".###x###x##.",
    "..###x###x..",
    "...######...",
    ".....xx.....",
    ".....##.....",
    "....#xx#....",
    "....####....",
  ],
  iron: [
    "............",
    "##........##",
    "############",
    "#+o+o+o+o+o#",
    "#o+o+o+o+o+#",
    "#+o+o+o+o+o#",
    "#o+o+o+o+o+#",
    "############",
    "##........##",
    "##........##",
    "##........##",
    "++........++",
  ],
  bronze: [
    "....####....",
    "..########..",
    ".#oo######+.",
    ".#o#######+.",
    "##o#######++",
    "##########++",
    "##########++",
    "#########+++",
    ".########++.",
    ".#######+++.",
    "..##+++++...",
    "....++++....",
  ],
  silver: [
    "...######...",
    "..########..",
    ".#oo#######.",
    ".#o########.",
    ".##########.",
    ".#########+.",
    "..#######+..",
    "...######...",
    ".....++.....",
    ".....++.....",
    "....+oo+....",
    "....++++....",
  ],
  gold: [
    "..########..",
    "##oo########",
    "#.#o#####+.#",
    "#.#######+.#",
    ".##########.",
    "..#######+..",
    "...#####+...",
    ".....##.....",
    ".....##.....",
    "...######...",
    "..++++++++..",
    "..++++++++..",
  ],
  platinum: [
    "############",
    "#++++++++++#",
    "#+++oooo+++#",
    "#++oo#ooo++#",
    "#++o#ooooo+#",
    "#++oooooo++#",
    "#+++oooo+++#",
    ".#++++++++#.",
    ".#++++++++#.",
    "..#++++++#..",
    "...#++++#...",
    "....####....",
  ],
  diamond: [
    "o..........o",
    "...######...",
    "..#oo#+##+..",
    ".#oo##+###+.",
    "############",
    ".#o###+###+.",
    "..#o##+##+..",
    "...#o#+#+...",
    "....##+#....",
    ".....##.....",
    "o..........o",
    "............",
  ],
  master: [
    "............",
    "o....oo....o",
    "#....##....#",
    "##..####..##",
    "###.####.###",
    "############",
    "#o###oo###o#",
    "############",
    "#+########+#",
    "++++++++++++",
    "............",
    "............",
  ],
  grandmaster: [
    "..+...+...+.",
    ".+o+.+o+.+o+",
    ".+oo++oo++o+",
    "+oooooooooo+",
    "..########..",
    ".##########.",
    "############",
    "###########x",
    "##########xx",
    ".########xx.",
    "..######xx..",
    "....xxxx....",
  ],
};

/** A tier's pixel emblem. `size` in px (renders crisp at multiples of 12). */
export function TierEmblem({ tierKey, size = 24, className = "", title }) {
  const art = ART[tierKey] || ART.bronze;
  const fill =
    tierKey === "grandmaster"
      ? GM
      : { "#": `var(--tier-${tierKey}-fg)`, "+": `var(--tier-${tierKey}-bd)`, o: "rgba(255,255,255,0.9)", x: `var(--tier-${tierKey}-bd)` };
  const rects = [];
  art.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (fill[c]) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" style={{ fill: fill[c] }} />);
    }),
  );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      className={`shrink-0 ${className}`}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
    >
      {rects}
    </svg>
  );
}

export const TIER_KEYS = TIERS.map((t) => t.key);
