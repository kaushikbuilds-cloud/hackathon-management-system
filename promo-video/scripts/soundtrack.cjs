// Writes public/soundtrack.wav: an original, code-generated soundtrack timed to
// the scenes in src/Promo.tsx (swap in licensed music any time).
const fs = require("fs");
const path = require("path");

const RATE = 44100, SECONDS = 51, N = RATE * SECONDS;
const L = new Float32Array(N), R = new Float32Array(N);
const BPM = 96, BEAT = 60 / BPM, BAR = BEAT * 4;
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function add(start, dur, fn, pan = 0) {
  const s0 = Math.max(0, Math.floor(start * RATE)), s1 = Math.min(N, Math.floor((start + dur) * RATE));
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = s0; i < s1; i++) { const v = fn((i - s0) / RATE); L[i] += v * gl; R[i] += v * gr; }
}
const env = (t, dur, a, r) => Math.min(1, t / a) * Math.min(1, Math.max(0, (dur - t) / r));

// Soft pad: a few detuned sines and a quiet triangle per note, slow attack.
function pad(start, dur, notes, amp = 0.05, pan = 0) {
  for (const [k, m] of notes.entries()) for (const d of [-0.12, 0, 0.12]) {
    const f = hz(m + d * 0.1) * (1 + d * 0.004);
    add(start, dur, (t) => env(t, dur, 0.9, 1.2) * amp * (Math.sin(2 * Math.PI * f * t) + 0.25 * (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * f * 2 * t))) / 3, pan + (k - 1) * 0.25);
  }
}
function pluck(start, m, amp = 0.09, pan = 0) {
  const f = hz(m);
  add(start, 0.9, (t) => amp * Math.exp(-t * 5.5) * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 9)), pan);
}
function kick(start, amp = 0.5) {
  add(start, 0.4, (t) => amp * Math.exp(-t * 11) * Math.sin(2 * Math.PI * (48 + 90 * Math.exp(-t * 30)) * t));
}
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
function noise(start, dur, amp, shape, lp = 0.2, pan = 0) {
  let y = 0;
  add(start, dur, (t) => { const k = typeof lp === "function" ? lp(t) : lp; y += k * (rnd() - y); return amp * shape(t) * y; }, pan);
}
const hat = (start, amp = 0.05) => noise(start, 0.06, amp, (t) => Math.exp(-t * 60), 0.9, 0.2);
const whoosh = (start, amp = 0.2) => noise(start - 0.35, 0.7, amp, (t) => Math.sin(Math.PI * t / 0.7) ** 2, (t) => 0.02 + 0.25 * (t / 0.7));
const click = (start) => add(start, 0.05, (t) => 0.25 * Math.exp(-t * 90) * Math.sin(2 * Math.PI * 2400 * t));
const chime = (start) => { for (const [i, m] of [84, 88, 91, 96].entries()) pluck(start + i * 0.06, m, 0.06, i % 2 ? 0.3 : -0.3); };

// Timing (seconds) from the video.
const T = { logoHit: (165 + 22) / 30, cta: 285 / 30, register: 360 / 30, checkin: 480 / 30, dashboard: 630 / 30, onsite: 780 / 30, judging: 930 / 30, certs: 1080 / 30, devices: 1185 / 30, tagline: 1320 / 30, end: 1410 / 30 };

// 1. Hook: low, uneasy drone and a riser into the logo hit.
pad(0, T.logoHit + 0.3, [45, 52, 57], 0.045);
add(0, T.logoHit, (t) => 0.06 * env(t, T.logoHit, 1.5, 0.2) * Math.sin(2 * Math.PI * 55 * t));
noise(T.logoHit - 2.4, 2.4, 0.22, (t) => (t / 2.4) ** 2.5, (t) => 0.01 + 0.3 * (t / 2.4));
for (let i = 0; i < 22; i++) click(0.35 + i * 0.085 + (i % 3) * 0.01); // typing

// 2. The hit.
kick(T.logoHit, 0.9);
noise(T.logoHit, 1.4, 0.3, (t) => Math.exp(-t * 3.5), 0.12);
add(T.logoHit, 2.5, (t) => 0.18 * Math.exp(-t * 1.6) * Math.sin(2 * Math.PI * 41 * t));

// 3. Features: Am F C G with beat and arpeggio.
const PROG = [[57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62]];
const ROOT = [45, 41, 48, 43];
const start = T.logoHit + 0.4, stop = T.devices;
for (let bar = 0, t0 = start; t0 < stop; bar++, t0 += BAR) {
  const c = PROG[bar % 4];
  pad(t0, BAR + 0.6, c.map((m) => m + 12), 0.035);
  add(t0, BAR, (t) => 0.07 * env(t, BAR, 0.05, 0.3) * Math.sin(2 * Math.PI * hz(ROOT[bar % 4]) * t)); // bass
  if (t0 >= T.cta - 0.1) {
    for (let b = 0; b < 4; b++) { if (b % 2 === 0) kick(t0 + b * BEAT, 0.32); hat(t0 + b * BEAT + BEAT / 2); }
    const arp = [c[0] + 24, c[1] + 24, c[2] + 24, c[1] + 24];
    for (let e = 0; e < 8; e++) if (t0 + e * BEAT / 2 < stop) pluck(t0 + e * BEAT / 2, arp[e % 4], 0.045, e % 2 ? 0.35 : -0.35);
  }
}
for (const t of [T.cta, T.register, T.checkin, T.dashboard, T.onsite, T.judging, T.certs]) whoosh(t, 0.16);
click(T.cta + 58 / 30); click(T.judging + 104 / 30);
chime(T.judging + 112 / 30);
pluck(T.checkin + 86 / 30, 88, 0.08); pluck(T.checkin + 86 / 30 + 0.08, 95, 0.07); // scan beep
chime(T.certs + 40 / 30);

// 4. Light section: brighter C G Am F, softer beat, then the end chime.
whoosh(T.devices, 0.2);
const PROG2 = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
for (let bar = 0, t0 = T.devices; t0 < SECONDS - 1; bar++, t0 += BAR) {
  const c = PROG2[bar % 4];
  pad(t0, BAR + 0.6, c.map((m) => m + 12), 0.04);
  for (let e = 0; e < 8; e++) pluck(t0 + e * BEAT / 2, c[e % 3] + 24, 0.035, e % 2 ? 0.4 : -0.4);
  if (t0 < T.end) for (let b = 0; b < 4; b++) hat(t0 + b * BEAT + BEAT / 2, 0.03);
}
chime(T.end + 0.2);

// Master: fade out, soft limit, normalise, 16-bit WAV.
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / RATE, fade = Math.min(1, (SECONDS - t) / 2.5);
  L[i] = Math.tanh(L[i] * 1.4) * fade; R[i] = Math.tanh(R[i] * 1.4) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const gain = 0.7 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(L[i] * gain * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(R[i] * gain * 32767), 46 + i * 4); }
fs.writeFileSync(path.join(__dirname, "../public/soundtrack.wav"), buf);
console.log("soundtrack.wav written", (buf.length / 1e6).toFixed(1), "MB");
