# HackGround OS product video

A 56-second 1080p product video made with [Remotion](https://remotion.dev), in the style of a SaaS launch video:
problem hook → logo reveal → registration → ID cards & QR check-in → live dashboard → food & mentor help →
judging & results → certificates → web / Android / Windows → sign up & pay ₹299 → tagline → end card.

- `src/Promo.tsx`: the scenes and their timing (`S` = start frame of each scene, 30 fps).
- `src/ui.tsx`: building blocks (blur-in words, typewriter, 3D-tilted screenshots, cursor, pill buttons, chips, phone frame).
- `public/shots/`: real screens of the app with demo data (InnovateX 2026).
- `scripts/soundtrack.cjs`: an original, code-generated soundtrack timed to the scenes. Replace
  `public/soundtrack.wav` with licensed music if you prefer (keep the file name).

```bash
npm install
npm run studio   # preview and edit in the browser
npm run render   # writes out/HackGroundOS-promo.mp4
```
