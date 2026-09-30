import { useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, Easing, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// Inter (the site's font), bundled so rendering works offline.
const fontFamily = "InterPromo";
const font = typeof FontFace === "undefined" ? null : new FontFace(fontFamily, `url(${staticFile("inter-latin.woff2")})`, { weight: "100 900" });

/** 3.2 s at 30 fps: H and S fly in, hit, bounce apart and reveal "HackGround OS". */
export const INTRO_FRAMES = 96;
export const BG = "#0D0F1C";

const WORD = "HackGround OS";
const HIT = 22; // frame of impact
const BIG = 1.6; // H and S are bigger while flying in

// Colours follow the logo: "Hack" pale lavender, "Ground" violet, "OS" light violet.
function colorOf(i: number) {
  if (i < 4) return "#EEF0FF";
  if (i < 10) return ["#C4B5FD", "#B69CF5", "#A78BFA", "#9B7CF7", "#8B6CF0", "#7C5CF0"][i - 4];
  return "#C4B5FD";
}

/** The H and S collide, bounce apart and reveal the name (same motion as the app intro). */
export const HSIntro = ({ fontSize = 78 }: { fontSize?: number }) => {
  const FONT_SIZE = fontSize;
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const spans = useRef<(HTMLSpanElement | null)[]>([]);
  const [box, setBox] = useState<{ x: number; w: number }[] | null>(null);
  const [handle] = useState(() => delayRender("measure letters"));

  // Final layout of every letter (transforms don't affect offsetLeft).
  useLayoutEffect(() => {
    (font ? font.load().then((f) => { document.fonts.add(f); }) : Promise.resolve()).then(() => {
      setBox(spans.current.map((s) => ({ x: s!.offsetLeft, w: s!.offsetWidth })));
      continueRender(handle);
    });
  }, [handle]);

  const cx = width / 2;
  const last = WORD.length - 1;
  const apart = spring({ frame: frame - HIT, fps, config: { damping: 11, stiffness: 90, mass: 0.9 } });
  const approach = interpolate(frame, [0, HIT], [0, 1], { extrapolateRight: "clamp", easing: Easing.in(Easing.quad) });
  const scale = frame < HIT ? BIG : interpolate(apart, [0, 1], [BIG, 1]);

  // Where H and S sit (centre offset from their final place) at a given moment.
  function offset(i: 0 | typeof last) {
    if (!box) return 0;
    const { x, w } = box[i];
    const home = x + w / 2;
    // Letter positions are measured inside the word, so its middle is where they meet.
    const mid = (box[last].x + box[last].w) / 2;
    const atHit = i === 0 ? mid - (w * BIG) / 2 : mid + (w * BIG) / 2;
    const start = (i === 0 ? -1 : 1) * (width * 0.62) + (atHit - home);
    if (frame < HIT) return interpolate(approach, [0, 1], [start, atHit - home]);
    return (atHit - home) * (1 - apart);
  }

  // Impact: flash, shock ring and a short shake.
  const since = frame - HIT;
  const flash = since >= 0 ? interpolate(since, [0, 2, 12], [0, 0.85, 0], { extrapolateRight: "clamp" }) : 0;
  const ring = since >= 0 ? interpolate(since, [0, 18], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }) : 0;
  const shake = since >= 0 && since < 10 ? Math.sin(since * 2.6) * (10 - since) * 1.4 : 0;
  const glow = interpolate(frame, [HIT, HIT + 20, 70, INTRO_FRAMES], [0, 0.9, 0.55, 0.65], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 50%, rgba(124,92,240,${0.35 * glow}) 0%, rgba(13,15,28,0) 55%)` }} />
      <div style={{ transform: `translate(${shake}px, ${shake * 0.4}px)`, width: "100%", display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", fontFamily, fontWeight: 800, fontSize: FONT_SIZE, letterSpacing: -2, whiteSpace: "pre", display: "flex" }}>
          {WORD.split("").map((ch, i) => {
            const edge = i === 0 || i === last;
            let style: React.CSSProperties;
            if (edge) {
              style = { transform: `translateX(${offset(i as 0 | typeof last)}px) scale(${scale})`, opacity: box ? 1 : 0,
                textShadow: `0 0 ${24 * glow}px rgba(139,92,246,0.8)` };
            } else {
              // Middle letters appear from the centre outwards as H and S move apart.
              const fromCentre = Math.abs(i - last / 2) / (last / 2);
              const t = interpolate(frame, [HIT + 4 + fromCentre * 16, HIT + 18 + fromCentre * 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
              style = { opacity: t, transform: `translateY(${(1 - t) * 26}px) scale(${0.8 + 0.2 * t})`, filter: `blur(${(1 - t) * 8}px)` };
            }
            return (
              <span key={i} ref={(el) => { spans.current[i] = el; }} style={{ display: "inline-block", color: colorOf(i), ...style }}>
                {ch}
              </span>
            );
          })}
        </div>
      </div>
      {/* White flash and an expanding ring where H and S meet. */}
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 50%, rgba(255,255,255,${flash}) 0%, rgba(196,181,253,${flash * 0.45}) 8%, rgba(13,15,28,0) 26%)` }} />
      {since >= 0 && (
        <div style={{ position: "absolute", left: cx, top: "50%", width: 40, height: 40, marginLeft: -20, marginTop: -20, borderRadius: "50%",
          border: `${interpolate(ring, [0, 1], [6, 1])}px solid rgba(196,181,253,${(1 - ring) * Math.min(1, since / 2)})`, transform: `scale(${1.5 + ring * 15})` }} />
      )}
      {/* The tagline line under the name, like the logo's "— OS —". */}
      <div style={{ position: "absolute", top: "50%", marginTop: FONT_SIZE, width: interpolate(frame, [55, 75], [0, 360], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }),
        height: 3, borderRadius: 2, background: "linear-gradient(90deg, rgba(124,92,240,0), #8B5CF6, rgba(124,92,240,0))" }} />
    </AbsoluteFill>
  );
};
