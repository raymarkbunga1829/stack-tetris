/** sRGB channels, 0..1. */
export type Rgb = { r: number; g: number; b: number };
export type Hsv = { h: number; s: number; v: number };

/** Share of the gap to full saturation a chromatic mino closes. */
export const SAT_PULL = 0.62;
/** Brightest a lifted mino gets (live piece, lock pop). Above this it would read as white. */
export const MAX_LIFT = 1.4;
/** How much of each lift step goes into value. */
const LIFT_GAIN = 0.3;
export const GHOST_EDGE_IDLE = 0.94;
/** WCAG-style contrast the ghost outline keeps against the pit. */
export const GHOST_CONTRAST = 3;

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6);
  const n = parseInt(full, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const v = Math.max(r, g, b);
  const d = v - Math.min(r, g, b);
  if (d === 0) return { h: 0, s: 0, v };
  let h = v === r ? ((g - b) / d) % 6 : v === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  if (h < 0) h += 1;
  return { h, s: d / v, v };
}

function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s;
  const hp = h * 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = v - c;
  return { r: r + m, g: g + m, b: b + m };
}

/** Linear-light relative luminance of an sRGB colour. */
export function luma({ r, g, b }: Rgb) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrast(a: Rgb, b: Rgb) {
  const la = luma(a);
  const lb = luma(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

const smooth = (a: number, b: number, t: number) => {
  const u = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});

/**
 * The face colour a mino is drawn with. The well draws minos unlit, after
 * bloom and tone mapping, so this is the colour that reaches the screen.
 * Chromatic skin colours are pulled toward full saturation; grey and
 * deliberately pale skins (Monolith, LCD, Quiet, the palest Ice and Sakura
 * cells) keep their own look. `lift` above 1 brightens value only, and never
 * past `MAX_LIFT`, so no state can turn a mino white.
 */
export function pieceTone(hex: string, lift = 1): Rgb {
  const base = rgbToHsv(hexToRgb(hex));
  const chroma = base.s * base.v;
  const lightness = base.v - chroma / 2;
  const w = smooth(0.1, 0.28, chroma) * (1 - smooth(0.8, 0.92, lightness));
  const yellow = 1 - smooth(0, 1, Math.abs(base.h * 360 - 54) / 26);
  const s = base.s + (1 - base.s) * Math.min(1, SAT_PULL + 0.25 * yellow) * w;
  const k = Math.min(lift, MAX_LIFT);
  const v = k < 1 ? base.v * k : Math.min(1, base.v * (1 + (k - 1) * LIFT_GAIN));
  return hsvToRgb({ h: base.h, s, v });
}

/** Pale pits get dark ghosts, and need the well lit brightly to stay pale. */
export function palePit(pitHex: string) {
  return luma(hexToRgb(pitHex)) > 0.18;
}

/**
 * The landing ghost is a solid outline in the piece colour with nothing
 * inside, so it can never be read as a locked mino. On a pit too close to the
 * piece colour (Monolith, LCD) the outline is pushed toward white or black
 * until it holds `GHOST_CONTRAST`. Locking pulses it, but it never fades out.
 */
export function ghostLook(hex: string, pitHex: string, now: number, lockFrac: number | null) {
  const pit = hexToRgb(pitHex);
  const piece = pieceTone(hex, 1.15);
  const pale = palePit(pitHex);
  const away = pale ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 };
  // A pale pit renders darker than its hex once lit, so aim the ghost further off it.
  const need = pale ? 7 : GHOST_CONTRAST;
  let tone = piece;
  for (let t = 0.1; contrast(tone, pit) < need && t <= 1.001; t += 0.1) tone = mix(piece, away, t);
  const edge =
    lockFrac == null
      ? GHOST_EDGE_IDLE + 0.06 * Math.sin(now * 0.0036)
      : 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(now * (0.014 + lockFrac * 0.05)));
  return { tone, edge };
}
