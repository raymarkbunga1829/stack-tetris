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

## Smoke tests

```bash
npx playwright install chromium        # once
npm run smoke -- https://stack-tetris.vercel.app/
npm run smoke -- --only start,drop-tap # a subset; URL defaults to http://127.0.0.1:8080/
```

Six checks on a phone-sized headless Chromium: Start starts a run, Watch keeps a
live well with a ticking clock, ES bot Off keeps Bot/Watch off the title, Pause →
Modes opens exactly one overlay, a Drop tap hard-drops, and a first visit does
not reload itself. Results land in `smoke-results/` (`report.json`, plus a PNG
per failed check).

To smoke a production build without Vercel: `npm run build && node scripts/serve-built.mjs`.

CI (`.github/workflows/smoke.yml`) runs the suite on every PR against that PR's
Vercel Preview and reports it as the **Smoke (Vercel Preview)** check. Previews
are behind Deployment Protection, so add the project's *Protection Bypass for
Automation* secret (Vercel → Settings → Deployment Protection) as the
`VERCEL_AUTOMATION_BYPASS_SECRET` repository secret. Without it the job smokes a
local production build of the same commit and says so in a warning; set the
repository variable `SMOKE_REQUIRE_PREVIEW=1` to make that a failure instead.

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
