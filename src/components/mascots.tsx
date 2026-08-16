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

type Who = "soot" | "lumen";

type Pose = { x: number; y: number; r: number; sx: number; sy: number };

const SHEET: Record<0 | 1 | 2 | 3, string> = {
  0: "0% 0%",
  1: "100% 0%",
  2: "0% 100%",
  3: "100% 100%",
};

function clamp(n: number, a = 0, b = 1) {
  return Math.max(a, Math.min(b, n));
}

function rest(): Pose {
  return { x: 0, y: 0, r: 0, sx: 1, sy: 1 };
}

function follow(cur: Pose, to: Pose, dt: number, pos = 16, rot = 10) {
  const kp = 1 - Math.exp(-dt * pos);
  const kr = 1 - Math.exp(-dt * rot);
  cur.x += (to.x - cur.x) * kp;
  cur.y += (to.y - cur.y) * kp;
  cur.r += (to.r - cur.r) * kr;
  cur.sx += (to.sx - cur.sx) * kp;
  cur.sy += (to.sy - cur.sy) * kp;
}

function cssOf(p: Pose) {
  return `translate3d(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px, 0) rotate(${p.r.toFixed(2)}deg) scale(${p.sx.toFixed(3)}, ${p.sy.toFixed(3)})`;
}

function pulse(t: number, a: number, b: number) {
  if (t < a || t > b) return 0;
  return Math.sin(((t - a) / (b - a)) * Math.PI);
}

function idleTarget(who: Who, t: number): Pose {
  const ph = who === "soot" ? 0 : 1.37;
  const heavy = who === "soot" ? 1 : 0.78;
  const breath = Math.sin(t * 1.55 + ph) * 0.62 + Math.sin(t * 0.37 + ph * 2) * 0.38;
  const sway = Math.sin(t * 0.72 + ph * 1.7);
  const look = Math.sin(t * 0.19 + ph) > 0.82 ? Math.sin(t * 3.2) * 2.4 : 0;
  const fidget = Math.sin(t * 0.28 + ph) > 0.74 ? Math.sin(t * 6.1 + ph) * 1.1 : 0;
  return {
    x: sway * 1.2 * (who === "lumen" ? 1 : -0.6) + fidget * 0.4,
    y: breath * -2.6 * heavy + fidget * -0.6,
    r: sway * 3.4 * (who === "soot" ? -1 : 1) + look + fidget,
    sx: 1 + breath * 0.028,
    sy: 1 - breath * 0.034,
  };
}

function reactTarget(who: Who, act: MascotAct, t: number): Pose {
  const side = who === "soot" ? -1 : 1;
  const late = who === "lumen" ? 0.05 : 0;
  const u = Math.max(0, t - late);

  if (act === "single") {
    const crouch = pulse(u, 0, 0.14);
    const nod = pulse(u, 0.1, 0.62);
    return {
      x: nod * side * 2,
      y: crouch * 3 - nod * 5,
      r: crouch * side * 6 + nod * side * -11,
      sx: 1 + crouch * 0.08 - nod * 0.03,
      sy: 1 - crouch * 0.1 + nod * 0.04,
    };
  }
  if (act === "double") {
    const a = pulse(u, 0.02, 0.38);
    const b = pulse(u, 0.36, 0.78);
    const land = pulse(u, 0.34, 0.46) + pulse(u, 0.72, 0.84);
    const h = a * 12 + b * 9;
    return {
      x: (a - b) * side * 2,
      y: land * 3 - h,
      r: (a * -8 + b * 7) * side,
      sx: 1 + land * 0.1 - h * 0.015,
      sy: 1 - land * 0.12 + h * 0.02,
    };
  }
  if (act === "triple") {
    const wind = pulse(u, 0, 0.16);
    const air = pulse(u, 0.12, 0.82);
    const land = pulse(u, 0.78, 1.02);
    return {
      x: air * side * 3,
      y: wind * 4 + land * 3 - air * 17,
      r: wind * side * 8 + air * side * -18 + land * side * 6,
      sx: 1 + wind * 0.1 + land * 0.08,
      sy: 1 - wind * 0.12 - land * 0.08 + air * 0.05,
    };
  }
  if (act === "stack" || act === "perfect") {
    const hops = pulse(u, 0.02, 0.34) * 14 + pulse(u, 0.38, 0.62) * 11 + pulse(u, 0.78, 1.18) * 16;
    const land = pulse(u, 0.3, 0.42) + pulse(u, 0.58, 0.7) + pulse(u, 1.14, 1.32);
    const twist = Math.sin(u * 7.2) * pulse(u, 0, 1.35) * 10;
    return {
      x: Math.sin(u * 6.4) * 2.4,
      y: land * 3.5 - hops,
      r: twist + land * 4 * side,
      sx: 1 + land * 0.09,
      sy: 1 - land * 0.1 + hops * 0.006,
    };
  }
  if (act === "tspin") {
    const reco = pulse(u, 0, 0.22);
    const wow = pulse(u, 0.16, 0.85);
    return {
      x: reco * side * -3 + wow * side * 3,
      y: reco * 2 - wow * 9,
      r: reco * side * 14 + wow * side * -16,
      sx: 1 + wow * 0.08,
      sy: 1 + wow * 0.04,
    };
  }
  if (act === "panic") {
    const n1 = Math.sin(t * 17.3);
    const n2 = Math.sin(t * 23.1 + 1.2);
    const n3 = Math.sin(t * 11.4 + 0.4);
    return {
      x: n1 * 2.6 + n3 * 1.1,
      y: Math.abs(n2) * 1.6,
      r: n1 * 6 + n2 * 3,
      sx: 1.03,
      sy: 0.97,
    };
  }
  const down = clamp(u / 0.55);
  const hit = pulse(u, 0.5, 0.85);
  return {
    x: down * side * 3,
    y: down * 9 - hit * 2,
    r: down * side * -16 + hit * side * 4,
    sx: 1 - down * 0.06 + hit * 0.04,
    sy: 1 - down * 0.1,
  };
}

function faceOf(who: Who, act: MascotAct, world: number, react: number): 0 | 1 | 2 | 3 {
  const blinkEvery = who === "soot" ? 3.7 : 4.5;
  const blinkOff = who === "soot" ? 0.4 : 1.8;
  const blink = (world + blinkOff) % blinkEvery < 0.11;
  if (act === "idle") return blink ? 1 : 0;
  if (act === "fail") return 1;
  if (act === "panic") return blink || world % 0.42 < 0.08 ? 1 : 2;
  if (act === "single") return react < 0.28 ? 2 : 3;
  if (act === "double") return react < 0.4 ? 3 : 2;
  if (act === "triple") return react < 0.2 ? 2 : 3;
  if (act === "tspin") return react < 0.24 ? 2 : 3;
  if (act === "stack" || act === "perfect") {
    const beat = react % 0.38;
    return beat < 0.18 ? 2 : 3;
  }
  return 0;
}

export function Mascots({ act }: { act: MascotAct }) {
  const soot = useRef<HTMLSpanElement>(null);
  const lumen = useRef<HTMLSpanElement>(null);
  const sootFace = useRef<HTMLElement>(null);
  const lumenFace = useRef<HTMLElement>(null);
  const smooth = useRef({ soot: rest(), lumen: rest() });
  const world = useRef(0);
  const last = useRef(performance.now());

  useEffect(() => {
    let raf = 0;
    let reactT = 0;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last.current) / 1000);
      last.current = now;
      world.current += dt;
      if (act !== "idle") reactT += dt;
      const w = world.current;
      const sootTo = act === "idle" ? idleTarget("soot", w) : reactTarget("soot", act, reactT);
      const lumenTo = act === "idle" ? idleTarget("lumen", w) : reactTarget("lumen", act, reactT);
      const posK = act === "idle" ? 11 : act === "panic" ? 22 : 15;
      const rotK = act === "idle" ? 7 : act === "panic" ? 18 : 10;
      follow(smooth.current.soot, sootTo, dt, posK, rotK);
      follow(smooth.current.lumen, lumenTo, dt, posK * 1.08, rotK * 1.05);
      if (soot.current) soot.current.style.transform = cssOf(smooth.current.soot);
      if (lumen.current) lumen.current.style.transform = cssOf(smooth.current.lumen);
      if (sootFace.current) sootFace.current.style.backgroundPosition = SHEET[faceOf("soot", act, w, reactT)];
      if (lumenFace.current) lumenFace.current.style.backgroundPosition = SHEET[faceOf("lumen", act, w, reactT)];
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
  if (act === "stack" || act === "perfect") return 1.5;
  if (act === "triple" || act === "tspin") return 1.12;
  if (act === "fail") return 1.3;
  if (act === "double") return 0.9;
  if (act === "panic") return 0.6;
  if (act === "single") return 0.75;
  return 0;
}
