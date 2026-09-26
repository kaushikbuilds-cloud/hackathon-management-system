/**
 * Pixel-art sprites (12×12) for stat tiles and dashboard blocks. Each sprite
 * is a grid of palette letters; "." is transparent. Decorative only.
 */
const PALETTE: Record<string, string> = {
  k: "#1b1209", // outline
  w: "#fbf4e4", // white
  s: "#f2c79a", // skin
  d: "#b9835a", // skin shade
  h: "#5a3a1e", // hair
  g: "#4caf50", // green
  G: "#2e7d32", // dark green
  y: "#f5b83d", // gold
  Y: "#c98a12", // dark gold
  b: "#5cc8ff", // blue
  B: "#1f5fbf", // dark blue
  p: "#b58cff", // purple
  P: "#6b3fd4", // dark purple
  r: "#ff6b5b", // red
  R: "#b3261e", // dark red
  o: "#ff9b3d", // orange
  n: "#8a5a32", // brown
};

const SPRITES = {
  team: [
    "............",
    "..hhh..hhh..",
    ".hsssh.hssh.",
    ".hkskhhskkh.",
    ".hsssh.hssh.",
    "..sds...sd..",
    ".BBBBB.PPPP.",
    "BBbbbBPPppPP",
    "BBbbbBPPppPP",
    "BB.bbBP.ppPP",
    "ss.BBBP.PPss",
    "...kk....kk.",
  ],
  person: [
    "...hhhhhh...",
    "..hhhhhhhh..",
    "..hssssssh..",
    "..skksskks..",
    "..ssssssss..",
    "..ssdssdss..",
    "...ssddss...",
    "..BBBBBBBB..",
    ".BBbbBBbbBB.",
    ".sBBBBBBBBs.",
    "..BBB..BBB..",
    "..kkk..kkk..",
  ],
  check: [
    "............",
    ".kkkkkkkkkk.",
    ".kGGGGGGGGk.",
    ".kGGGGGGwGk.",
    ".kGGGGGwwGk.",
    ".kGwGGwwGGk.",
    ".kGwwwwGGGk.",
    ".kGGwwGGGGk.",
    ".kGGGGGGGGk.",
    ".kGGGGGGGGk.",
    ".kkkkkkkkkk.",
    "............",
  ],
  help: [
    "............",
    "..kkkkkkkk..",
    ".kwwwwwwwwk.",
    ".kwwBBBBwwk.",
    ".kwwwwwBwwk.",
    ".kwwwwBBwwk.",
    ".kwwwBBwwwk.",
    ".kwwwwwwwwk.",
    ".kwwwBBwwwk.",
    "..kkkwwkkk..",
    "....kwk.....",
    "....kk......",
  ],
  trophy: [
    "............",
    ".yyyyyyyyyy.",
    "yYyyyyyyyyYy",
    "y.yyyyyyyy.y",
    "yYyywyyyyYy.",
    ".yyywyyyyy..",
    "..yyyyyyyy..",
    "...YyyyyY...",
    ".....yY.....",
    ".....yY.....",
    "...nnnnnn...",
    "..nnnnnnnn..",
  ],
  crown: [
    "............",
    "............",
    "y....y....y.",
    "yy..yyy..yy.",
    "yyy.yyy.yyy.",
    "yyyyyryyyyy.",
    "yyyybyyyryy.",
    "yYyyyyyyyYy.",
    "yyyyyyyyyyy.",
    "YYYYYYYYYYY.",
    "............",
    "............",
  ],
  food: [
    "............",
    "....o.o.o...",
    "...o.o.o....",
    "............",
    ".kkkkkkkkkk.",
    ".kyyyyyyyyk.",
    ".kyrryggyyk.",
    ".kyyyyyyyyk.",
    "..kyyyyyyk..",
    "...kkkkkk...",
    "..nnnnnnnn..",
    "............",
  ],
  clock: [
    "............",
    "...kkkkkk...",
    "..kwwwwwwk..",
    ".kwwwBwwwwk.",
    ".kwwwBwwwwk.",
    ".kwwwBwwwwk.",
    ".kwwwBBBwwk.",
    ".kwwwwwwwwk.",
    ".kwwwwwwwwk.",
    "..kwwwwwwk..",
    "...kkkkkk...",
    "............",
  ],
  card: [
    "............",
    "kkkkkkkkkkkk",
    "kBBBBBBBBBBk",
    "kwwwwwwwwwwk",
    "kwhhhwwkkkwk",
    "kwsssswwwwwk",
    "kwskkswkkwwk",
    "kwsssswwwwwk",
    "kwBBBBwkkkwk",
    "kwwwwwwwwwwk",
    "kkkkkkkkkkkk",
    "............",
  ],
  megaphone: [
    "............",
    "........kk..",
    "......kkyk..",
    "....kkyyyk..",
    ".kkkyyyyyk.o",
    ".kwwyyyyyk.o",
    ".kwwyyyyyk.o",
    ".kkkyyyyyk.o",
    "...kkkyyyk..",
    "...kn.kkyk..",
    "...kn...kk..",
    "...kk.......",
  ],
  shield: [
    "............",
    ".kkkkkkkkkk.",
    ".kPPPPPPPPk.",
    ".kPpppppPPk.",
    ".kPpyyypPPk.",
    ".kPpyyypPPk.",
    ".kPpppppPPk.",
    "..kPPPPPPk..",
    "..kPPPPPPk..",
    "...kPPPPk...",
    "....kPPk....",
    ".....kk.....",
  ],
  chart: [
    "............",
    "k...........",
    "k.......gg..",
    "k.......gg..",
    "k....bb.gg..",
    "k....bb.gg..",
    "k.pp.bb.gg..",
    "k.pp.bb.gg..",
    "k.pp.bb.gg..",
    "kkkkkkkkkkkk",
    "............",
    "............",
  ],
} satisfies Record<string, string[]>;

export type PixelIconName = keyof typeof SPRITES;

export function PixelIcon({ name, className = "size-10" }: { name: PixelIconName; className?: string }) {
  const rows = SPRITES[name];
  return (
    <svg viewBox="0 0 12 12" className={className} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {rows.flatMap((row, y) =>
        [...row].map((c, x) => (PALETTE[c] ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={PALETTE[c]} /> : null)),
      )}
    </svg>
  );
}
