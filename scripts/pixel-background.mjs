// Draws the site's pixel-art night landscape (public/pixel-bg.png).
// Run: node scripts/pixel-background.mjs — the page scales it up with crisp pixels.
import sharp from "sharp";

const W = 192, H = 108;
const px = Buffer.alloc(W * H * 3);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const set = (x, y, c) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const [r, g, b] = hex(c);
  px.set([r, g, b], (y * W + x) * 3);
};
const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Sky: stepped bands with a dithered row between each (classic pixel-art gradient).
const bands = [[0, "#140c29"], [16, "#1f1240"], [30, "#321857"], [42, "#52206b"], [52, "#7a2d6e"], [60, "#a93d61"], [66, "#d65f47"], [71, "#f0894a"]];
for (let y = 0; y < 76; y++) {
  let k = 0; while (k + 1 < bands.length && y >= bands[k + 1][0]) k++;
  for (let x = 0; x < W; x++) {
    const next = bands[k + 1];
    const dither = next && y === next[0] - 1 && (x + y) % 2 === 0;
    set(x, y, dither ? next[1] : bands[k][1]);
  }
}
// Stars and a moon.
for (let i = 0; i < 70; i++) { const x = Math.floor(rnd() * W), y = Math.floor(rnd() * 40); set(x, y, rnd() > 0.8 ? "#ffffff" : "#e8d9ff"); }
for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 26) set(160 + x, 14 + y, x * x + y * y > 16 ? "#e9d8a6" : "#fbf1c8");
set(158, 12, "#e2cf97"); set(162, 16, "#e2cf97"); set(161, 11, "#e2cf97");
// Blocky clouds.
const cloud = (x, y, s) => { rect(x, y + 2, 12 * s, 3, "#7d4f95"); rect(x + 2 * s, y, 7 * s, 2, "#9a66ad"); rect(x + 3 * s, y - 1, 3 * s, 1, "#b07fc0"); };
cloud(18, 20, 1); cloud(70, 12, 2); cloud(128, 30, 1); cloud(172, 38, 1);
// Far mountains: a stepped height map.
const ridge = (base, amp, color, cap, step) => {
  let h = base;
  for (let x = 0; x < W; x += step) {
    h = Math.max(base - amp, Math.min(base, h + Math.round((rnd() - 0.5) * 6)));
    for (let i = 0; i < step; i++) { rect(x + i, h, 1, H - h, color); if (cap) set(x + i, h, cap); }
  }
};
ridge(64, 16, "#3a1f55", "#5a3175", 3);
ridge(72, 8, "#28163f", "#3d2458", 2);
// Castle on the right hill, windows lit.
const castle = "#1c1030";
rect(118, 52, 34, 24, castle);
for (let x = 118; x < 152; x += 3) rect(x, 50, 2, 2, castle);
rect(112, 44, 8, 32, castle); rect(111, 42, 2, 2, castle); rect(115, 42, 2, 2, castle); rect(119, 42, 1, 2, castle);
rect(150, 40, 9, 36, castle); rect(149, 38, 2, 2, castle); rect(153, 38, 2, 2, castle); rect(157, 38, 2, 2, castle);
rect(132, 36, 7, 16, castle); rect(134, 32, 3, 4, castle); set(135, 30, "#ffcf5c"); set(135, 31, castle);
for (const [x, y] of [[114, 50], [114, 56], [153, 46], [153, 54], [124, 58], [130, 58], [140, 58], [146, 58], [135, 42]]) { set(x, y, "#ffb454"); set(x, y + 1, "#f58a2b"); }
rect(133, 66, 5, 10, "#0f0820"); set(135, 70, "#b58cff");
// Mid hills with pine trees.
ridge(80, 5, "#1a1030", "#24173f", 4);
for (let x = 2; x < W; x += 5 + Math.floor(rnd() * 5)) {
  if (x > 108 && x < 162) continue;
  const h = 6 + Math.floor(rnd() * 6), base = 80 + Math.floor(rnd() * 3);
  for (let j = 0; j < h; j++) { const w = Math.max(1, Math.floor((j + 2) / 2)); rect(x - Math.floor(w / 2), base - h + j, w, 1, j % 3 === 0 ? "#173323" : "#10261b"); }
  rect(x, base, 1, 2, "#2b1a10");
}
// Lake with reflections.
for (let y = 84; y < 94; y++) for (let x = 0; x < W; x++) set(x, y, (y + Math.floor(x / 6)) % 5 === 0 ? "#2a3566" : "#1a2346");
for (let i = 0; i < 26; i++) { const x = Math.floor(rnd() * (W - 6)), y = 85 + Math.floor(rnd() * 8); rect(x, y, 2 + Math.floor(rnd() * 5), 1, rnd() > 0.5 ? "#e07a4a" : "#8a3a74"); }
rect(158, 85, 5, 1, "#f2e3b0"); rect(159, 87, 3, 1, "#d9c893");
// Grass and dirt blocks.
for (let x = 0; x < W; x++) {
  const top = 94 + ((Math.floor(x / 4) * 7) % 3 === 0 ? -1 : 0);
  for (let y = top; y < H; y++) {
    const d = y - top;
    const c = d === 0 ? "#4caf50" : d === 1 ? ((x % 3) ? "#2e7d32" : "#3c9a40") : d < 3 ? "#256b2a" : ((x * 7 + y * 13) % 11 === 0 ? "#6b6258" : (x + y) % 4 === 0 ? "#4a3322" : "#3b2a1c");
    set(x, y, c);
  }
}
for (let x = 0; x < W; x += 8) for (let y = 97; y < H; y += 8) set(x, y, "#2a1d13");

await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9, palette: true }).toFile("public/pixel-bg.png");
console.log("public/pixel-bg.png written");
