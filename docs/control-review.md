# Controls review and first update

Reviewed against main commit `14669562df339a38ee3dd84f159ed71a79c715a5`.

## Findings addressed

- Losing focus cleared held keys and touch input, but left queued hard drops,
  powers, gesture movement and previous-frame state intact. These could affect
  the next input sample after an interruption. All pending input now resets on
  blur and when the document becomes hidden.
- The input visibility listener was anonymous and never removed by `dispose()`.
  It now has a named handler and matching cleanup.
- The game testing interface omitted the implemented `getClock` and
  `getTimeLeft` methods, causing TypeScript validation to fail. Its declarations
  now match the implementation.

## Added feature

Settings now offers Relaxed, Classic and Fast control presets. Each updates and
saves the existing movement-delay, movement-repeat and soft-drop settings. The
sliders remain available for custom tuning; Classic restores the original
values. The selected preset is marked visually and for assistive technology.
Each slider now includes a plain-language explanation and accessible value.
The existing fixed on-screen-pad delay is preserved and explained.

## Scope

This is a focused source review of input, settings and their integration, not a
full security or gameplay audit. Deployment is a separate step.

## Validation

- `npm test`: 47 tests passed, including interruption and disposal regressions.
- `npm run typecheck`: passed after correcting the existing interface mismatch.
- `npm run build:dev`: client and server build passed; existing large-bundle
  warning remains. This command does not run database migrations.
- Browser layout and preset-persistence checks remain unverified: the required
  Playwright browser download timed out in this environment.
