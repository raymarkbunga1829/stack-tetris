/** sRGB channels, 0..1. */
export type Rgb = { r: number; g: number; b: number };
export type Hsv = { h: number; s: number; v: number };

/** Share of the gap to full saturation a chromatic mino closes. */
export const SAT_PULL = 0.62;
/** Linear luminance ceilings for resting and lifted (live, placed) chromatic minos. */
export const BODY_LUMA_CAP = 0.26;
export const LIFT_LUMA_CAP = 0.34;
export const YELLOW_HEADROOM = 0.75;
/** Lifts at or above this are deliberate lock / pick flashes and may go white. */
export const FLASH_LIFT = 1.5;
export const GHOST_EDGE_IDLE = 0.86;
export const GHOST_FILL = 0.14;

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

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function scaleLinear({ r, g, b }: Rgb, k: number): Rgb {
  return { r: toSrgb(toLinear(r) * k), g: toSrgb(toLinear(g) * k), b: toSrgb(toLinear(b) * k) };
}

const smooth = (a: number, b: number, t: number) => {
  const u = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/**
 * Mino albedo for the lit 3D well. Env reflections, clearcoat and ACES all add
 * white on top, so a pastel skin colour has to go in deeper than it reads in
 * the flat UI. Grey and deliberately pale skins (Monolith, LCD, Quiet, the
 * palest Ice and Sakura cells) are left mostly as they are.
 * `lift` brightens within a luminance ceiling instead of multiplying past 1,
 * which is what blew the live piece out to cream.
 */
export function pieceTone(hex: string, lift = 1): Rgb {
  const src = hexToRgb(hex);
  if (lift >= FLASH_LIFT) return src;
  const base = rgbToHsv(src);
  const chroma = base.s * base.v;
  const lightness = base.v - chroma / 2;
  const w = smooth(0.1, 0.28, chroma) * (1 - smooth(0.8, 0.92, lightness));
  const yellow = 1 - smooth(0, 1, Math.abs(base.h * 360 - 54) / 26);
  const s = base.s + (1 - base.s) * Math.min(1, SAT_PULL + 0.25 * yellow) * w;
  const v = lift < 1 ? base.v * lift : Math.min(1, base.v * (1 + (lift - 1) * 0.3));
  const rgb = hsvToRgb({ h: base.h, s, v });
  if (w === 0) return rgb;
  // Yellow, cyan and green carry far more luminance than red or blue at the
  // same value, and the well's lights push that excess straight to white.
  // Yellow only reads as yellow when it is bright; held to the same ceiling
  // as blue it turns olive, so it gets headroom while it stays fully saturated.
  const cap = (lift > 1 ? LIFT_LUMA_CAP : BODY_LUMA_CAP) * (1 + YELLOW_HEADROOM * yellow);
  const y = luma(rgb);
  const limit = y + (Math.min(y, cap) - y) * w;
  return y > limit ? scaleLinear(rgb, limit / y) : rgb;
}

/**
 * The landing ghost is an outline in the piece colour over a faint tint, so
 * it can never be read as a locked mino. Locking pulses the outline faster.
 */
export function ghostLook(hex: string, now: number, lockFrac: number | null) {
  const tone = pieceTone(hex, 1.2);
  const edge =
    lockFrac == null
      ? GHOST_EDGE_IDLE + 0.1 * Math.sin(now * 0.0036)
      : 0.5 + 0.45 * (0.5 + 0.5 * Math.sin(now * (0.014 + lockFrac * 0.05)));
  return { tone, edge, fill: GHOST_FILL };
}
