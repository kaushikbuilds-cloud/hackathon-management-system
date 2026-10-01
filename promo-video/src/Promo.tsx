import { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { HSIntro } from "./HSIntro";
import { BlurWords, Backdrop, C, Chip, Cursor, FONT, Mark, Phone, Pill, SceneFade, Tilted, Typewriter, prog } from "./ui";

/** Scene start frames (30 fps). */
const S = { hook: 0, logo: 165, cta: 285, register: 360, checkin: 480, dashboard: 630, onsite: 780, judging: 930, certs: 1080, devices: 1185, pricing: 1320, tagline: 1470, end: 1560 };
export const PROMO_FRAMES = 1680;
const len = (a: keyof typeof S, b: keyof typeof S | number) => (typeof b === "number" ? b : S[b]) - S[a];

export const Promo = () => {
  // Load Inter once for every scene.
  const [handle] = useState(() => delayRender("font"));
  useEffect(() => {
    const font = new FontFace(FONT, `url(${staticFile("inter-latin.woff2")})`, { weight: "100 900" });
    font.load().then((f) => { document.fonts.add(f); continueRender(handle); });
  }, [handle]);
  const f = useCurrentFrame();
  const light = interpolate(f, [S.devices - 10, S.devices + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Backdrop light={light} />
      <Audio src={staticFile("soundtrack.wav")} volume={(fr) => interpolate(fr, [0, 20, PROMO_FRAMES - 45, PROMO_FRAMES], [0, 0.9, 0.9, 0], { extrapolateRight: "clamp" })} />
      <Sequence from={S.hook} durationInFrames={len("hook", "logo")}><Hook /></Sequence>
      <Sequence from={S.logo} durationInFrames={len("logo", "cta")}><LogoReveal /></Sequence>
      <Sequence from={S.cta} durationInFrames={len("cta", "register")}><RegisterCta /></Sequence>
      <Sequence from={S.register} durationInFrames={len("register", "checkin")}><RegisterPage /></Sequence>
      <Sequence from={S.checkin} durationInFrames={len("checkin", "dashboard")}><CheckIn /></Sequence>
      <Sequence from={S.dashboard} durationInFrames={len("dashboard", "onsite")}><Dashboard /></Sequence>
      <Sequence from={S.onsite} durationInFrames={len("onsite", "judging")}><OnSite /></Sequence>
      <Sequence from={S.judging} durationInFrames={len("judging", "certs")}><Judging /></Sequence>
      <Sequence from={S.certs} durationInFrames={len("certs", "devices")}><Certificates /></Sequence>
      <Sequence from={S.devices} durationInFrames={len("devices", "pricing")}><Devices /></Sequence>
      <Sequence from={S.pricing} durationInFrames={len("pricing", "tagline")}><Pricing /></Sequence>
      <Sequence from={S.tagline} durationInFrames={len("tagline", "end")}><Tagline /></Sequence>
      <Sequence from={S.end} durationInFrames={len("end", PROMO_FRAMES)}><EndCard /></Sequence>
    </AbsoluteFill>
  );
};

/* 1. The problem: messy spreadsheets and group chats. */
function Hook() {
  const f = useCurrentFrame();
  const second = f >= 78;
  return (
    <SceneFade dur={len("hook", "logo")} inFrames={14}>
      <MessyBackground />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {!second ? <Typewriter text="Still running your hackathon on" start={10} caretUntil={78} />
          : <BlurWords text="spreadsheets & WhatsApp groups?" start={80} size={92} weight={600} highlight={["spreadsheets", "WhatsApp", "groups?"]} />}
      </AbsoluteFill>
    </SceneFade>
  );
}

function MessyBackground() {
  const f = useCurrentFrame();
  const card = (x: number, y: number, r: number, delay: number, child: React.ReactNode, w = 460) => {
    const t = prog(f, delay, 30);
    return (
      <div style={{ position: "absolute", left: x, top: y + Math.sin((f + delay * 3) / 40) * 12, width: w, transform: `rotate(${r}deg) scale(${0.9 + 0.1 * t})`, opacity: 0.55 * t,
        filter: "blur(1.5px)", borderRadius: 16, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", padding: 20, backdropFilter: "blur(4px)" }}>{child}</div>
    );
  };
  const row = (cells: string[], head = false) => (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.8fr", gap: 8, fontSize: 18, color: head ? "#C4B5FD" : "rgba(255,255,255,0.7)", fontWeight: head ? 600 : 400, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      {cells.map((c, i) => <span key={i}>{c}</span>)}
    </div>
  );
  const bubble = (text: string, me = false) => (
    <div style={{ alignSelf: me ? "flex-end" : "flex-start", background: me ? "rgba(16,185,129,0.35)" : "rgba(255,255,255,0.14)", color: "#fff", fontSize: 20, padding: "10px 16px", borderRadius: 14, maxWidth: 360 }}>{text}</div>
  );
  return (
    <AbsoluteFill>
      {card(90, 90, -6, 0, <>{row(["Team", "College", "Paid?"], true)}{row(["Code Crusaders", "IIT M", "??"])}{row(["Byte Bandits", "NIT T", "yes"])}{row(["Team 14 (dup)", "—", "no"])}{row(["Quantum…", "AU", "?"])}</>)}
      {card(1330, 110, 5, 8, <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{bubble("Where's the final team list??")}{bubble("Check the sheet v7_final_FINAL", true)}{bubble("Who took attendance today?")}</div>, 440)}
      {card(170, 700, 4, 16, <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{bubble("How many veg meals for dinner?")}{bubble("No idea 😅", true)}</div>, 420)}
      {card(1290, 690, -4, 22, <>{row(["Judge", "Team", "Score"], true)}{row(["Judge 2", "Byte B.", "8?"])}{row(["Judge 1", "Code C.", "—"])}{row(["Judge 3", "???", "7"])}</>, 480)}
    </AbsoluteFill>
  );
}

/* 2. The logo: H and S collide and reveal the name. */
function LogoReveal() {
  const f = useCurrentFrame();
  const mark = prog(f, 62, 24);
  return (
    <SceneFade dur={len("logo", "cta")} inFrames={6}>
      <AbsoluteFill style={{ transform: `translateY(${mark * 70}px)` }}><HSIntro fontSize={132} /></AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 170, opacity: mark, transform: `scale(${0.85 + 0.15 * mark})` }}>
        <Mark size={200} />
      </AbsoluteFill>
    </SceneFade>
  );
}

/* 3. Registration opens. */
function RegisterCta() {
  const f = useCurrentFrame();
  const word = f < 30;
  return (
    <SceneFade dur={len("cta", "register")} inFrames={8}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {word ? <BlurWords text="Open registration" size={120} weight={600} start={0} stagger={5} />
          : <Pill label="Register your team" start={30} pressAt={58} icon={<span style={{ fontSize: 46 }}>＋</span>} size={1.15} />}
      </AbsoluteFill>
      <Cursor points={[{ f: 34, x: 1480, y: 860 }, { f: 56, x: 1080, y: 560, click: true }, { f: 75, x: 1090, y: 570 }]} />
    </SceneFade>
  );
}

function Caption({ text, start = 0, top = 90, dark = true, highlight }: { text: string; start?: number; top?: number; dark?: boolean; highlight?: string[] }) {
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: top, zIndex: 20 }}>
      <BlurWords text={text} start={start} size={64} weight={600} color={dark ? "#fff" : C.ink} highlight={highlight} />
    </AbsoluteFill>
  );
}

/* 4. The registration form. */
function RegisterPage() {
  return (
    <SceneFade dur={len("register", "checkin")}>
      <Caption text="Teams sign up in minutes" highlight={["minutes"]} />
      <Tilted src="shots/register.jpg" start={4} width={1500} from={{ rx: 26, ry: -18, y: 420, s: 0.85 }} to={{ rx: 12, ry: -8, y: 150, s: 1 }} />
      <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "flex-end", padding: "0 150px 120px 0" }}>
        <Chip start={70} tone="violet" size={32}>✓ Team Code Crusaders registered</Chip>
      </AbsoluteFill>
    </SceneFade>
  );
}

/* 5. ID card with QR, scanned at the door. */
function CheckIn() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = spring({ frame: f - 6, fps, config: { damping: 18, stiffness: 80 } });
  const scan = prog(f, 48, 36, Easing.inOut(Easing.quad));
  const scanned = f >= 86;
  const count = Math.round(interpolate(f, [90, 130], [63, 64], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <SceneFade dur={len("checkin", "dashboard")}>
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 140 }}>
        <div style={{ transform: `perspective(1600px) rotateY(${(1 - card) * -50 + 8}deg) rotateX(4deg) translateY(${(1 - card) * 80}px)`, opacity: card, position: "relative" }}>
          <IdCard />
          {!scanned && f > 48 && <div style={{ position: "absolute", left: 60, right: 60, top: 330 + scan * 230, height: 4, background: "#34D399", boxShadow: "0 0 30px 8px rgba(52,211,153,0.7)", borderRadius: 4 }} />}
          {scanned && <div style={{ position: "absolute", inset: 0, borderRadius: 28, boxShadow: `0 0 0 ${4}px rgba(52,211,153,${1 - prog(f, 86, 30)}), 0 0 90px rgba(52,211,153,${0.6 * (1 - prog(f, 86, 40))})` }} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 34, width: 700 }}>
          <BlurWords text="Every member gets an ID card with a QR code" start={10} size={62} weight={600} style={{ justifyContent: "flex-start" }} highlight={["QR", "code"]} />
          <div style={{ display: "flex", flexDirection: "column", gap: 22, alignItems: "flex-start" }}>
            {scanned && <Chip start={86} size={36}>✓ Checked in · Aarav Sharma</Chip>}
            {scanned && <Chip start={96} tone="violet" size={30}>{count} / 84 participants checked in</Chip>}
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}

function IdCard() {
  // A stable, QR-looking pattern.
  const cells: boolean[] = [];
  let seed = 7;
  for (let i = 0; i < 21 * 21; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; cells.push(seed % 3 === 0); }
  const finder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c > 13) || (r > 13 && c < 7);
  return (
    <div style={{ width: 460, height: 700, borderRadius: 28, background: "#fff", overflow: "hidden", boxShadow: "0 50px 120px -20px rgba(124,58,237,0.6)", fontFamily: FONT }}>
      <div style={{ height: 150, background: "linear-gradient(135deg,#1B1640,#4C1D95 60%,#6D28D9)", display: "flex", alignItems: "center", gap: 18, padding: "0 30px" }}>
        <Img src={staticFile("logo-card.png")} style={{ width: 80, height: 80, borderRadius: 18 }} />
        <div style={{ color: "#fff" }}><div style={{ fontSize: 30, fontWeight: 700 }}>InnovateX 2026</div><div style={{ fontSize: 18, opacity: 0.8 }}>Participant</div></div>
      </div>
      <div style={{ padding: "26px 34px 0", color: C.ink }}>
        <div style={{ fontSize: 38, fontWeight: 700 }}>Aarav Sharma</div>
        <div style={{ fontSize: 22, color: "#475569", marginTop: 4 }}>Code Crusaders · IIT Madras</div>
        <div style={{ fontSize: 20, color: "#6366F1", marginTop: 8, fontFamily: "monospace" }}>INX26-P0001</div>
      </div>
      <div style={{ margin: "24px auto 0", width: 300, height: 300, display: "grid", gridTemplateColumns: "repeat(21, 1fr)", padding: 14, background: "#fff", border: "2px solid #E2E8F0", borderRadius: 16 }}>
        {cells.map((on, i) => {
          const r = Math.floor(i / 21), c = i % 21;
          const fin = finder(r, c);
          const ring = fin && (r % 14 === 0 || r % 14 === 6 || c % 14 === 0 || c % 14 === 6 || (r % 14 >= 2 && r % 14 <= 4 && c % 14 >= 2 && c % 14 <= 4));
          return <div key={i} style={{ background: (fin ? ring : on) ? "#0F172A" : "transparent" }} />;
        })}
      </div>
    </div>
  );
}

/* 6. The live dashboard. */
function Dashboard() {
  const f = useCurrentFrame();
  const zoom = prog(f, 70, 50);
  return (
    <SceneFade dur={len("dashboard", "onsite")}>
      <AbsoluteFill style={{ opacity: 1 - zoom, zIndex: 20 }}><Caption text="Your whole event, live on one screen" highlight={["live"]} /></AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${1 + zoom * 0.35}) translate(${zoom * 180}px, ${zoom * 60}px)`, transformOrigin: "50% 60%" }}>
        <Tilted src="shots/dashboard.jpg" start={4} width={1500} from={{ rx: 24, ry: 16, y: 420, s: 0.85 }} to={{ rx: 10, ry: 6, y: 150, s: 1 }} />
      </AbsoluteFill>
    </SceneFade>
  );
}

/* 7. On the day: food orders and mentor help. */
function OnSite() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: f - 6, fps, config: { damping: 18, stiffness: 70 } });
  const b = spring({ frame: f - 18, fps, config: { damping: 18, stiffness: 70 } });
  return (
    <SceneFade dur={len("onsite", "judging")}>
      <Caption text="Food orders and mentor help, built in" top={70} highlight={["Food", "mentor", "help,"]} />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 260, paddingTop: 150 }}>
        <div style={{ position: "relative", transform: `perspective(1800px) rotateY(${14 - (1 - a) * 30}deg) translateY(${(1 - a) * 300}px)`, opacity: a }}>
          <Phone src="shots/portal-food.jpg" width={380} />
          <div style={{ position: "absolute", right: -190, top: 170 }}><Chip start={52} size={30}>🍜 Order #0101 is ready</Chip></div>
        </div>
        <div style={{ position: "relative", transform: `perspective(1800px) rotateY(${-14 + (1 - b) * 30}deg) translateY(${(1 - b) * 300}px)`, opacity: b }}>
          <Phone src="shots/portal-mentor.jpg" width={380} />
          <div style={{ position: "absolute", left: -250, top: 330 }}><Chip start={70} tone="violet" size={30}>🛟 A mentor is on the way</Chip></div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}

/* 8. Judging and results. */
function Judging() {
  const f = useCurrentFrame();
  const pill = f >= 78;
  const board = 1 - prog(f, 70, 12);
  return (
    <SceneFade dur={len("judging", "certs")}>
      {!pill && <Caption text="Judge. Rank. Announce." highlight={["Announce."]} />}
      <AbsoluteFill style={{ opacity: board, filter: `blur(${(1 - board) * 10}px)` }}>
        <Tilted src="shots/leaderboard-table.jpg" start={4} width={1500} from={{ rx: 22, ry: -12, y: 420, s: 0.85 }} to={{ rx: 10, ry: -4, y: 150, s: 1 }} />
      </AbsoluteFill>
      {pill && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <Pill label="Publish results" start={78} pressAt={104} done="Results published" size={1.15} icon={<span style={{ fontSize: 44 }}>🏆</span>} />
        </AbsoluteFill>
      )}
      <Cursor points={[{ f: 84, x: 1500, y: 880 }, { f: 102, x: 1040, y: 565, click: true }, { f: 140, x: 1060, y: 590 }]} />
    </SceneFade>
  );
}

/* 9. Certificates, ready to download. */
function Certificates() {
  const f = useCurrentFrame();
  const ring = prog(f, 6, 34, Easing.inOut(Easing.cubic));
  const tick = prog(f, 36, 16);
  const r = 90, c = 2 * Math.PI * r;
  return (
    <SceneFade dur={len("certs", "devices")} outFrames={14}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 760, padding: "64px 0 56px", borderRadius: 36, background: "linear-gradient(160deg,#17142B,#0E0C1B)", border: "1px solid rgba(196,181,253,0.25)", boxShadow: "0 60px 140px -30px rgba(124,58,237,0.6)", display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <svg width="240" height="240" viewBox="0 0 240 240">
            <circle cx="120" cy="120" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="12" fill="none" />
            <circle cx="120" cy="120" r={r} stroke="#34D399" strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - ring)} transform="rotate(-90 120 120)" style={{ filter: "drop-shadow(0 0 12px rgba(52,211,153,0.8))" }} />
            <path d="M82 124 l26 26 l52 -56" stroke="#fff" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="130" strokeDashoffset={130 * (1 - tick)} />
          </svg>
          <div style={{ fontSize: 60, fontWeight: 600, color: "#fff", letterSpacing: -1.5, opacity: tick }}>Certificates ready</div>
          <div style={{ opacity: prog(f, 50, 16), padding: "14px 30px", borderRadius: 999, border: "1px solid rgba(196,181,253,0.5)", color: "#C4B5FD", fontSize: 28, fontWeight: 500 }}>⬇ Download for every participant</div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}

/* 10. One platform on every screen (light section). */
function Devices() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = (d: number) => spring({ frame: f - d, fps, config: { damping: 18, stiffness: 70 } });
  const [a, b, c] = [sp(14), sp(24), sp(34)];
  return (
    <SceneFade dur={len("devices", "pricing")} inFrames={16}>
      <Caption text="One platform. Every screen." dark={false} top={80} highlight={["Every", "screen."]} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingTop: 170 }}>
        <div style={{ position: "relative", width: 1500, height: 720 }}>
          {/* Laptop: web */}
          <div style={{ position: "absolute", left: 250, top: 20, opacity: a, transform: `translateY(${(1 - a) * 120}px)` }}>
            <div style={{ width: 1000, borderRadius: "22px 22px 0 0", padding: 16, background: "#1E1B2E" }}>
              <Img src={staticFile("shots/dashboard.jpg")} style={{ width: "100%", display: "block", borderRadius: 8 }} />
            </div>
            <div style={{ width: 1160, height: 34, marginLeft: -80, borderRadius: "0 0 24px 24px", background: "linear-gradient(#D4D4DE,#A9A9B8)", boxShadow: "0 40px 80px -30px rgba(15,23,42,0.5)" }} />
          </div>
          {/* Windows app window */}
          <div style={{ position: "absolute", left: -20, top: 290, width: 560, borderRadius: 14, overflow: "hidden", background: "#fff", boxShadow: "0 40px 90px -20px rgba(15,23,42,0.45), 0 0 0 1px rgba(15,23,42,0.08)", opacity: b, transform: `translateX(${(1 - b) * -120}px)` }}>
            <div style={{ height: 40, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", background: "#F1F0F7", fontSize: 18, color: "#334155", fontWeight: 600 }}>
              <Img src={staticFile("logo-card.png")} style={{ width: 24, height: 24, borderRadius: 6 }} />HackGround OS<span style={{ marginLeft: "auto", letterSpacing: 10, color: "#64748B" }}>–▢✕</span>
            </div>
            <Img src={staticFile("shots/mentors.jpg")} style={{ width: "100%", display: "block" }} />
          </div>
          {/* Phone: Android */}
          <div style={{ position: "absolute", right: -10, top: 150, opacity: c, transform: `translateY(${(1 - c) * 160}px) rotate(4deg)` }}>
            <Phone src="shots/portal.jpg" width={270} />
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 70, display: "flex", gap: 24 }}>
          {["Web", "Android app", "Windows app"].map((t, i) => (
            <div key={t} style={{ opacity: prog(f, 50 + i * 8, 14), transform: `translateY(${(1 - prog(f, 50 + i * 8, 14)) * 20}px)`, padding: "14px 30px", borderRadius: 999, background: "#fff", color: C.ink, fontSize: 28, fontWeight: 600, boxShadow: "0 12px 40px -10px rgba(124,58,237,0.35), 0 0 0 1px rgba(15,23,42,0.06)" }}>{t}</div>
          ))}
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}

/* 11. Self-serve: sign up, pay ₹299, start today. */
function Pricing() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const steps = [
    { n: "1", title: "Create your account", body: "Name, email, college", at: 20 },
    { n: "2", title: "Pay ₹299", body: "UPI, cards, net banking", at: 30 },
    { n: "3", title: "Your hackathon is ready", body: "In under a minute", at: 40 },
  ];
  const paid = f >= 96;
  return (
    <SceneFade dur={len("pricing", "tagline")}>
      <Caption text="Start today. ₹299 per hackathon." dark={false} top={110} highlight={["₹299"]} />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 48, paddingTop: 120 }}>
        {steps.map((st, i) => {
          const a = spring({ frame: f - st.at, fps, config: { damping: 16, stiffness: 90 } });
          const active = i === 0 ? f >= 66 : i === 1 ? paid : f >= 112;
          return (
            <div key={st.n} style={{ width: 460, padding: "40px 40px 44px", borderRadius: 32, background: "#fff", opacity: a, transform: `translateY(${(1 - a) * 90}px)`,
              boxShadow: active ? "0 30px 80px -24px rgba(124,58,237,0.55), 0 0 0 2px rgba(124,58,237,0.35)" : "0 24px 60px -24px rgba(15,23,42,0.3), 0 0 0 1px rgba(15,23,42,0.06)" }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 700,
                background: active ? "linear-gradient(135deg,#8B5CF6,#6366F1)" : "#EEF0FF", color: active ? "#fff" : C.violet }}>{active ? "✓" : st.n}</div>
              <div style={{ marginTop: 26, fontSize: 40, fontWeight: 700, color: C.ink, letterSpacing: -1 }}>{st.title}</div>
              <div style={{ marginTop: 8, fontSize: 26, color: "#64748B" }}>{st.body}</div>
              {i === 1 && (
                <div style={{ marginTop: 28, display: "inline-flex", padding: "16px 34px", borderRadius: 999, fontSize: 28, fontWeight: 700, color: "#fff",
                  background: paid ? C.green : C.brand, transform: `scale(${f >= 90 && f < 96 ? 0.94 : 1})` }}>{paid ? "Paid ✓" : "Pay ₹299"}</div>
              )}
            </div>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 110 }}>
        {f >= 116 && <Chip start={116} tone="violet" size={32}>🚀 InnovateX 2026 is live · open your dashboard</Chip>}
      </AbsoluteFill>
      <Cursor points={[{ f: 60, x: 1500, y: 950 }, { f: 88, x: 900, y: 760, click: true }, { f: 120, x: 930, y: 790 }]} />
    </SceneFade>
  );
}

/* 12. The promise. */
function Tagline() {
  return (
    <SceneFade dur={len("tagline", "end")}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <BlurWords text="Less chaos. More hacking." start={4} stagger={7} size={120} weight={600} color={C.ink} highlight={["hacking."]} />
      </AbsoluteFill>
    </SceneFade>
  );
}

/* 13. End card. */
function EndCard() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: f - 4, fps, config: { damping: 14, stiffness: 90 } });
  return (
    <SceneFade dur={len("end", PROMO_FRAMES)} outFrames={1}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36, transform: `scale(${0.8 + 0.2 * logo})`, opacity: logo }}>
          <Img src={staticFile("logo-card.png")} style={{ width: 170, height: 170, borderRadius: 38, boxShadow: "0 30px 80px -20px rgba(124,58,237,0.6)" }} />
          <div style={{ fontSize: 124, fontWeight: 800, letterSpacing: -4, color: C.ink }}>
            Hack<span style={{ background: "linear-gradient(90deg,#8B5CF6,#6366F1)", WebkitBackgroundClip: "text", color: "transparent" }}>Ground</span> <span style={{ color: "#7C5CF0" }}>OS</span>
          </div>
        </div>
        <div style={{ opacity: prog(f, 24, 16), fontSize: 34, color: "#475569", fontWeight: 500 }}>Run your whole hackathon from one place.</div>
        <div style={{ opacity: prog(f, 36, 16), transform: `translateY(${(1 - prog(f, 36, 16)) * 16}px)`, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ padding: "18px 40px", borderRadius: 999, background: "linear-gradient(90deg,#7C5CF0,#4F46E5)", color: "#fff", fontSize: 32, fontWeight: 700, boxShadow: "0 20px 50px -16px rgba(79,70,229,0.7)" }}>Start your hackathon · ₹299</div>
          <div style={{ padding: "18px 40px", borderRadius: 999, background: C.ink, color: "#fff", fontSize: 32, fontWeight: 600 }}>hackgroundos.vercel.app</div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}
