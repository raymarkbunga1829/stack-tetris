# Stack

A Guideline-style stacking game built as a mobile-first PWA.

- 7-bag randomizer, SRS kicks, hold, ghost, next queue
- Modes: Marathon, Sprint 40, Blitz 2:00, Daily
- Powers: Zap, Slow, Shield, Quake, Pick
- Touch pad + drag to shift + tap to rotate
- 3D well with bloom lighting
- Local save, themes, daily missions, shop (demo IAP)

## Run

```bash
npm install
npm run dev
```

Open the printed local URL. `npm run build` then `npm run preview` for a production build.

## Controls

| Input | Action |
| --- | --- |
| Drag on the well | Move left / right |
| Tap the well | Rotate |
| Left / Right / Soft | Pad moves |
| CW / CCW | Rotate |
| Hold | Park the current piece |
| Drop | Hard drop |
| A D · W · S · Space · C | Keyboard |

## App Store (iOS)

This repo includes a **Capacitor** wrapper. The game is copied into a native Xcode project — it does not load a website.

On a Mac:

```bash
npm install
npm run cap:sync
npm run cap:open
```

Full steps, product IDs, and review notes: **[APP_STORE.md](./APP_STORE.md)**.
