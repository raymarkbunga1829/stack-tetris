import { useEffect, useRef } from "react";

export type MascotAct =
  | "idle"
  | "single"
  | "double"
  | "triple"
  | "stack"
  | "tspin"
  | "perfect"
  | "panic"
  | "fail";

const SHEET: Record<0 | 1 | 2 | 3, string> = {
  0: "0% 0%",
  1: "100% 0%",
  2: "0% 100%",
  3: "100% 100%",
};

function clamp(n: number, a = 0, b = 1) {
  return Math.max(a, Math.min(b, n));
}

function easeOut(t: number) {
  return 1 - (1 - clamp(t)) ** 3;
}

function bounce(t: number) {
  const x = clamp(t);
  return Math.sin(x * Math.PI);
}

function frameOf(act: MascotAct, t: number): 0 | 1 | 2 | 3 {
  if (act === "idle") {
    const c = t % 3.2;
    return c > 2.55 && c < 2.85 ? 1 : 0;
  }
  if (act === "panic") return t % 0.28 < 0.14 ? 1 : 2;
  if (act === "fail") return 1;
  if (act === "single") return t < 0.32 ? 2 : 3;
  if (act === "double") return t % 0.36 < 0.18 ? 3 : 2;
  if (act === "triple") return t % 0.28 < 0.14 ? 3 : 2;
  if (act === "stack" || act === "perfect") return t % 0.24 < 0.12 ? 2 : 3;
  if (act === "tspin") return t < 0.4 ? 2 : 3;
  return 0;
}

function pose(who: "soot" | "lumen", act: MascotAct, t: number): string {
  const late = who === "lumen" ? 0.07 : 0;
  const u = Math.max(0, t - late);
  const side = who === "soot" ? -1 : 1;
  if (act === "idle") {
    const w = Math.sin(t * 2.05 + (who === "lumen" ? 1.3 : 0));
    return `translate3d(0, ${w * -3.2}px, 0) rotate(${w * 2.2 * side}deg) scale(${1 + w * 0.02}, ${1 - w * 0.025})`;
  }
  if (act === "single") {
    const n = bounce(u / 0.68);
    return `translate3d(0, ${n * -5}px, 0) rotate(${side * (-10 + n * 16)}deg)`;
  }
  if (act === "double") {
    const n = bounce(u / 0.4) + bounce((u - 0.38) / 0.36) * 0.7;
    return `translate3d(0, ${n * -13}px, 0) scale(${1 + n * 0.06}, ${1 - n * 0.05})`;
  }
  if (act === "triple") {
    const n = bounce(u / 0.95);
    return `translate3d(0, ${n * -18}px, 0) rotate(${side * n * -22}deg) scale(${1 + n * 0.08})`;
  }
  if (act === "stack" || act === "perfect") {
    const n = bounce((u % 0.46) / 0.46);
    const spin = Math.sin(u * 10) * 14;
    return `translate3d(${Math.sin(u * 12) * 3}px, ${n * -16}px, 0) rotate(${spin}deg) scale(${1 + n * 0.1})`;
  }
  if (act === "tspin") {
    const n = easeOut(u / 0.95);
    const lift = Math.sin(n * Math.PI) * 10;
    return `translate3d(0, ${-lift}px, 0) rotate(${side * (-16 + n * 20)}deg) scale(${1 + Math.sin(n * Math.PI) * 0.1})`;
  }
  if (act === "panic") {
    const s = Math.sin(t * 28);
    return `translate3d(${s * 3.2}px, ${Math.abs(s) * 1.2}px, 0) rotate(${s * 8}deg)`;
  }
  const n = easeOut(u / 0.8);
  return `translate3d(0, ${n * 8}px, 0) rotate(${side * n * -18}deg) scale(${1 - n * 0.08}, ${1 - n * 0.12})`;
}

export function Mascots({ act }: { act: MascotAct }) {
  const soot = useRef<HTMLElement>(null);
  const lumen = useRef<HTMLElement>(null);
  const sootFace = useRef<HTMLElement>(null);
  const lumenFace = useRef<HTMLElement>(null);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const frame = frameOf(act, t);
      if (soot.current) soot.current.style.transform = pose("soot", act, t);
      if (lumen.current) lumen.current.style.transform = pose("lumen", act, t);
      if (sootFace.current) sootFace.current.style.backgroundPosition = SHEET[frame];
      if (lumenFace.current) lumenFace.current.style.backgroundPosition = SHEET[frame];
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [act]);

  return (
    <div className={`mascots is-${act}`} aria-hidden="true">
      <span ref={soot} className="mascot-wrap soot">
        <i ref={sootFace} className="mascot soot" />
      </span>
      <span ref={lumen} className="mascot-wrap lumen">
        <i ref={lumenFace} className="mascot lumen" />
      </span>
    </div>
  );
}

export function mascotHold(act: MascotAct): number {
  if (act === "stack" || act === "perfect") return 1.45;
  if (act === "triple" || act === "tspin") return 1.08;
  if (act === "fail") return 1.25;
  if (act === "double") return 0.82;
  if (act === "panic") return 0.55;
  if (act === "single") return 0.7;
  return 0;
}
