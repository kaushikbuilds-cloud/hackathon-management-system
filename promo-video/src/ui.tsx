import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export const FONT = "InterPromo";
export const C = { night: "#0B0A16", ink: "#0F172A", violet: "#7C5CF0", violetLight: "#C4B5FD", lavender: "#EEF0FF", brand: "#4F46E5", green: "#10B981" };
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** 0 → 1 between two frames with a smooth ease. */
export function prog(frame: number, from: number, dur: number, easing = EASE) {
  return interpolate(frame, [from, from + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });
}

/** Fades a whole scene in and out (with a little blur), like the reference. */
export function SceneFade({ dur, children, inFrames = 10, outFrames = 10 }: { dur: number; children: ReactNode; inFrames?: number; outFrames?: number }) {
  const f = useCurrentFrame();
  const o = Math.min(prog(f, 0, inFrames), 1 - prog(f, dur - outFrames, outFrames, Easing.in(Easing.quad)));
  return <AbsoluteFill style={{ opacity: o, filter: `blur(${(1 - o) * 10}px)` }}>{children}</AbsoluteFill>;
}

/** Words blur in one after another. */
export function BlurWords({ text, start = 0, stagger = 4, size = 84, color = "#fff", weight = 600, style, highlight }: { text: string; start?: number; stagger?: number; size?: number; color?: string; weight?: number; style?: CSSProperties; highlight?: string[] }) {
  const f = useCurrentFrame();
  return (
    <div style={{ fontFamily: FONT, fontSize: size, fontWeight: weight, letterSpacing: -size * 0.03, color, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${size * 0.26}px`, lineHeight: 1.12, ...style }}>
      {text.split(" ").map((w, i) => {
        const t = prog(f, start + i * stagger, 18);
        const hl = highlight?.includes(w.replace(/[^\w&]/g, ""));
        return (
          <span key={i} style={{ display: "inline-block", opacity: t, filter: `blur(${(1 - t) * 14}px)`, transform: `translateY(${(1 - t) * 24}px)`,
            ...(hl ? { background: "linear-gradient(90deg,#C4B5FD,#8B5CF6 60%,#6366F1)", WebkitBackgroundClip: "text", color: "transparent" } : {}) }}>{w}</span>
        );
      })}
    </div>
  );
}

/** Text typed character by character with a blinking caret. */
export function Typewriter({ text, start, cps = 26, size = 76, color = "#fff", weight = 500, caretUntil }: { text: string; start: number; cps?: number; size?: number; color?: string; weight?: number; caretUntil?: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(0, Math.min(text.length, Math.floor(((f - start) / fps) * cps)));
  const caret = (caretUntil === undefined || f < caretUntil) && Math.floor(f / 15) % 2 === 0;
  return (
    <div style={{ fontFamily: FONT, fontSize: size, fontWeight: weight, color, letterSpacing: -size * 0.025, whiteSpace: "pre" }}>
      {text.slice(0, n)}<span style={{ opacity: caret ? 1 : 0, color: C.violetLight, fontWeight: 300 }}>|</span>
    </div>
  );
}

/** Dark violet backdrop with a slowly drifting glow (fades to light with `light` 0..1). */
export function Backdrop({ light = 0 }: { light?: number }) {
  const f = useCurrentFrame();
  const x = 50 + Math.sin(f / 70) * 12;
  const dark = `radial-gradient(ellipse 60% 55% at ${x}% 108%, rgba(124,58,237,0.75), rgba(124,58,237,0) 70%), radial-gradient(ellipse 50% 40% at ${100 - x}% -10%, rgba(99,102,241,0.25), rgba(0,0,0,0) 70%), ${C.night}`;
  const lightBg = `radial-gradient(ellipse 60% 50% at ${x}% 110%, rgba(167,139,250,0.45), rgba(255,255,255,0) 70%), radial-gradient(ellipse 45% 40% at ${100 - x}% 0%, rgba(110,231,183,0.18), rgba(255,255,255,0) 70%), #F7F7FB`;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: dark }} />
      <AbsoluteFill style={{ background: lightBg, opacity: light }} />
    </AbsoluteFill>
  );
}

/** A screenshot in 3D perspective that settles into place. */
export function Tilted({ src, start = 0, width = 1400, from = { rx: 18, ry: -14, y: 260, s: 0.9 }, to = { rx: 8, ry: -6, y: 0, s: 1 }, drift = 0.04, radius = 18, style, glow = true, children }: {
  src: string; start?: number; width?: number; from?: { rx: number; ry: number; y: number; s: number }; to?: { rx: number; ry: number; y: number; s: number }; drift?: number; radius?: number; style?: CSSProperties; glow?: boolean; children?: ReactNode;
}) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame: f - start, fps, config: { damping: 22, stiffness: 70, mass: 1 } });
  const mix = (a: number, b: number) => a + (b - a) * t;
  const d = (f - start) * drift;
  return (
    <div style={{ position: "absolute", left: "50%", top: "50%", perspective: 2200, ...style }}>
      <div style={{ width, marginLeft: -width / 2, transform: `translateY(calc(-50% + ${mix(from.y, to.y)}px)) rotateX(${mix(from.rx, to.rx) - d * 0.3}deg) rotateY(${mix(from.ry, to.ry) + d * 0.4}deg) scale(${mix(from.s, to.s)})`,
        opacity: Math.min(1, t * 1.6), transformStyle: "preserve-3d", position: "relative" }}>
        <Img src={staticFile(src)} style={{ width: "100%", display: "block", borderRadius: radius,
          boxShadow: glow ? "0 40px 120px -20px rgba(124,58,237,0.55), 0 0 0 1px rgba(196,181,253,0.35)" : "0 30px 80px -20px rgba(15,23,42,0.35), 0 0 0 1px rgba(15,23,42,0.08)" }} />
        {children}
      </div>
    </div>
  );
}

/** Mouse pointer moving through points; `click` frames show a ripple. */
export function Cursor({ points }: { points: { f: number; x: number; y: number; click?: boolean }[] }) {
  const f = useCurrentFrame();
  if (f < points[0].f - 10) return null;
  let x = points[0].x, y = points[0].y;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (f >= a.f && f <= b.f) { const t = prog(f, a.f, b.f - a.f, Easing.inOut(Easing.cubic)); x = a.x + (b.x - a.x) * t; y = a.y + (b.y - a.y) * t; }
    if (f > b.f) { x = b.x; y = b.y; }
  }
  const click = points.find((p) => p.click && f >= p.f && f < p.f + 14);
  const press = click ? 1 - Math.abs((f - click.f) - 3) / 10 : 0;
  const appear = prog(f, points[0].f - 10, 10);
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: appear, pointerEvents: "none", zIndex: 50 }}>
      {click && <div style={{ position: "absolute", left: -30, top: -30, width: 60, height: 60, borderRadius: "50%", border: "3px solid rgba(196,181,253,0.9)", transform: `scale(${0.4 + (f - click.f) / 10})`, opacity: 1 - (f - click.f) / 14 }} />}
      <svg width="44" height="44" viewBox="0 0 24 24" style={{ transform: `scale(${1 - Math.max(0, press) * 0.15})`, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))" }}>
        <path d="M4 2l15 9.5-6.6 1.4 3.9 7.2-2.7 1.4-3.9-7.2L4 18.9z" fill="#fff" stroke="#111" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Glowing pill button (like the reference's "New mail" / "Send for approval"). */
export function Pill({ label, start = 0, pressAt, icon, size = 1, done }: { label: string; start?: number; pressAt?: number; icon?: ReactNode; size?: number; done?: string }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - start, fps, config: { damping: 14, stiffness: 120 } });
  const pressed = pressAt !== undefined && f >= pressAt;
  const push = pressAt !== undefined ? 1 - 0.06 * Math.max(0, 1 - Math.abs(f - pressAt - 3) / 6) : 1;
  const showDone = done && pressed && f >= pressAt! + 8;
  return (
    <div style={{ transform: `scale(${(0.7 + 0.3 * s) * push * size})`, opacity: s, display: "inline-flex", alignItems: "center", gap: 22, padding: "30px 64px", borderRadius: 999,
      background: showDone ? "linear-gradient(135deg,#34D399,#10B981)" : "linear-gradient(135deg,#8B5CF6,#6D28D9 55%,#4F46E5)",
      boxShadow: `0 0 0 1px rgba(255,255,255,0.25) inset, 0 20px 80px ${showDone ? "rgba(16,185,129,0.55)" : "rgba(124,58,237,0.7)"}`, fontFamily: FONT, fontSize: 52, fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>
      {showDone ? "✓" : icon}{showDone ? done : label}
    </div>
  );
}

/** Small status chip that pops in. */
export function Chip({ children, start = 0, tone = "green", size = 30, style }: { children: ReactNode; start?: number; tone?: "green" | "violet" | "amber"; size?: number; style?: CSSProperties }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - start, fps, config: { damping: 12, stiffness: 140 } });
  const tones = { green: ["#ECFDF5", "#047857", "rgba(16,185,129,0.45)"], violet: ["#F5F3FF", "#5B21B6", "rgba(124,58,237,0.5)"], amber: ["#FFFBEB", "#92400E", "rgba(245,158,11,0.45)"] }[tone];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 14, padding: `${size * 0.5}px ${size * 0.9}px`, borderRadius: 999, background: tones[0], color: tones[1], fontFamily: FONT, fontWeight: 600, fontSize: size,
      boxShadow: `0 18px 50px ${tones[2]}, 0 0 0 1px rgba(255,255,255,0.6) inset`, transform: `scale(${0.6 + 0.4 * s}) translateY(${(1 - s) * 30}px)`, opacity: Math.min(1, s * 1.5), whiteSpace: "nowrap", ...style }}>
      {children}
    </div>
  );
}

/** Phone with a screenshot. */
export function Phone({ src, width = 420, style }: { src: string; width?: number; style?: CSSProperties }) {
  return (
    <div style={{ width, height: width * 2.05, borderRadius: width * 0.13, padding: width * 0.035, background: "linear-gradient(145deg,#2A2740,#0E0C1A)", boxShadow: "0 50px 120px -20px rgba(124,58,237,0.55), 0 0 0 2px rgba(196,181,253,0.25)", ...style }}>
      <div style={{ width: "100%", height: "100%", borderRadius: width * 0.1, overflow: "hidden", background: "#fff" }}>
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
      </div>
    </div>
  );
}

export const Mark = ({ size = 160, style }: { size?: number; style?: CSSProperties }) => <Img src={staticFile("h-mark.png")} style={{ width: size, height: size, ...style }} />;
