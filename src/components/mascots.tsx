import { useEffect, useRef, type RefObject } from "react";
import { sfxLand } from "@/game/audio";

export type MascotAct =
  | "idle"
  | "single"
  | "double"
  | "triple"
  | "stack"
  | "tspin"
  | "perfect"
  | "panic"
  | "fail"
  | "recover"
  | "nap"
  | "wake"
  | "bump";

export type MascotWorld = {
  look: number;
  down: number;
  duck: number;
  asleep: boolean;
  shake: number;
  sleepT: number;
};

type Who = "soot" | "lumen";
const MASS: Record<Who, number> = { soot: 1.22, lumen: 0.84 };
type Bit = "none" | "glance" | "scratch" | "hop" | "peer";

type Pose = { x: number; y: number; r: number; sx: number; sy: number };
type Spring = {
  y: number;
  v: number;
  squash: number;
  hold: number;
  rebound: number;
  dust: number;
  dip: number;
  tilt: number;
};

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

function spring0(): Spring {
  return { y: 0, v: 0, squash: 0, hold: 0, rebound: 0, dust: 0, dip: 0, tilt: 0 };
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

function add(a: Pose, b: Partial<Pose>): Pose {
  return {
    x: a.x + (b.x ?? 0),
    y: a.y + (b.y ?? 0),
    r: a.r + (b.r ?? 0),
    sx: a.sx * (b.sx ?? 1),
    sy: a.sy * (b.sy ?? 1),
  };
}

function stepHop(
  s: Spring,
  other: Spring,
  dt: number,
  floor: number,
  g: number,
  heavy: number,
) {
  const mass = heavy;
  s.dust = Math.max(0, s.dust - dt * 2.8);
  s.dip = Math.max(0, s.dip - dt * 7.2);
  s.tilt *= Math.exp(-dt * 7);
  if (s.hold > 0) {
    s.hold -= dt;
    s.y = floor;
    s.v = 0;
    s.squash = Math.max(s.squash - dt * 1.8, 0.18);
    if (s.hold <= 0 && s.rebound) {
      s.v = s.rebound;
      s.rebound = 0;
    }
    return;
  }
  s.v += g * dt;
  s.y += s.v * dt;
  s.squash = Math.max(0, s.squash - dt * 4.4);
  if (s.y > floor) {
    const hit = s.v;
    s.y = floor;
    if (hit > 50) {
      const w = Math.min(1, hit / 400);
      s.squash = Math.min(1.2, (0.5 + w * 0.72) * heavy);
      s.hold = (0.035 + w * 0.06) * heavy;
      s.rebound = -hit * (heavy > 1 ? 0.16 : 0.28);
      s.dust = Math.min(1, 0.45 + w * 0.7);
      s.dip = (2.2 + w * 4) * heavy;
      s.tilt = (mass > 1 ? -1 : 1) * (5 + w * 7);
      if (hit > 90) {
        other.v -= 48 * mass;
        other.tilt += mass > 1 ? 7 : -6;
        other.squash = Math.max(other.squash, 0.1 + mass * 0.05);
        sfxLand(mass);
      }
    } else {
      s.v = 0;
      if (hit > 18) s.squash = Math.max(s.squash, 0.16);
    }
  }
}

function kick(s: Spring, impulse: number) {
  s.v = Math.min(s.v, 0) + impulse;
}

function idleTarget(who: Who, t: number, recover: number, asleep: boolean, sleepT: number): Pose {
  const ph = who === "soot" ? 0 : 1.37;
  const heavy = MASS[who];
  if (asleep) {
    const debt = clamp(sleepT / 18);
    const breath = Math.sin(t * (0.85 - debt * 0.25) + ph) * 0.45;
    return {
      x: who === "soot" ? -2 - debt : 2 + debt,
      y: 5 + debt * 4.2 + breath * -1.2,
      r: (who === "soot" ? -22 : 20) * (1 + debt * 0.35),
      sx: 1.06 + debt * 0.06 + breath * 0.02,
      sy: 0.9 - debt * 0.06 - breath * 0.02,
    };
  }
  const rec = clamp(recover / 1.15);
  const amp = 1 + rec * 1.15;
  const breath = (Math.sin(t * (1.55 + rec * 0.8) + ph) * 0.62 + Math.sin(t * 0.37 + ph * 2) * 0.38) * amp;
  const sway = Math.sin(t * 0.72 + ph * 1.7);
  return {
    x: sway * 1.1 * (who === "lumen" ? 1 : -0.55),
    y: breath * -2.5 * heavy,
    r: sway * 3.2 * (who === "soot" ? -1 : 1),
    sx: 1 + breath * 0.03,
    sy: 1 - breath * 0.036,
  };
}

function bitOffset(who: Who, bit: Bit, t: number): Partial<Pose> {
  if (bit === "none") return {};
  const side = who === "soot" ? -1 : 1;
  if (bit === "glance") {
    const g = pulse(t, who === "lumen" ? 0.18 : 0, 0.95);
    return { r: -side * g * 16, x: -side * g * 2 };
  }
  if (bit === "scratch") {
    if (who !== "soot") return { r: 4 };
    const s = pulse(t, 0.08, 0.85);
    const wiggle = Math.sin(t * 22) * s * 3;
    return { r: 10 + wiggle, y: s * 2, x: wiggle * 0.4 };
  }
  if (bit === "peer") {
    const p = pulse(t, 0, 1.05);
    return { r: side * p * -7, x: side * p * 1.4 };
  }
  return {};
}

function reactSpin(who: Who, act: MascotAct, t: number, sleepT = 0): Partial<Pose> {
  const side = who === "soot" ? -1 : 1;
  const late = who === "lumen" ? 0.05 : 0;
  const u = Math.max(0, t - late);
  if (act === "single") {
    const nod = pulse(u, 0.1, 0.62);
    return { x: nod * side * 2, r: nod * side * -11 };
  }
  if (act === "double") {
    const a = pulse(u, 0.02, 0.38);
    const b = pulse(u, 0.36, 0.78);
    return { x: (a - b) * side * 2, r: (a * -8 + b * 7) * side };
  }
  if (act === "triple") {
    const air = pulse(u, 0.12, 0.82);
    return { x: air * side * 3, r: air * side * -16 };
  }
  if (act === "stack" || act === "perfect") {
    return { x: Math.sin(u * 6.4) * 2.4, r: Math.sin(u * 7.2) * pulse(u, 0, 1.35) * 10 };
  }
  if (act === "tspin") {
    const wow = pulse(u, 0.16, 0.85);
    return { x: wow * side * 3, r: wow * side * -16 };
  }
  if (act === "panic") {
    const flinch = pulse(t % 1.45, 0.08, 0.28);
    return { x: side * -1.6, r: side * 9 + flinch * side * -7 };
  }
  if (act === "fail") {
    const down = clamp(u / 0.55);
    return { x: down * side * 3, r: down * side * -16 };
  }
  if (act === "wake") {
    const debt = clamp(sleepT / 18);
    const span = 0.35 + debt * 0.35;
    const stretch = pulse(u, 0, span);
    const shake = pulse(u, span * 0.7, 0.55 + debt * 0.4);
    return { y: stretch * -3, r: shake * side * 8, sx: 1 + stretch * 0.08, sy: 1 - stretch * 0.06 };
  }
  if (act === "bump") {
    const inw = pulse(u, 0, 0.55);
    const tap = pulse(u, 0.18, 0.38);
    return { x: -side * (inw * 10 + tap * 4), r: -side * inw * 14 };
  }
  return {};
}

function faceOf(who: Who, act: MascotAct, world: number, react: number, bit: Bit): 0 | 1 | 2 | 3 {
  const blinkEvery = who === "soot" ? 3.7 : 4.5;
  const blinkOff = who === "soot" ? 0.4 : 1.8;
  const blink = (world + blinkOff) % blinkEvery < 0.11;
  if (act === "idle" || act === "recover") {
    if (bit === "scratch" && who === "soot") return 2;
    return blink ? 1 : 0;
  }
  if (act === "nap") return 1;
  if (act === "wake") return react < 0.25 ? 1 : blink ? 1 : 0;
  if (act === "bump") return react < 0.35 ? 3 : 2;
  if (act === "fail") return 1;
  if (act === "panic") return blink || pulse(world % 1.45, 0.08, 0.22) > 0.4 ? 1 : 2;
  if (act === "single") return react < 0.28 ? 2 : 3;
  if (act === "double") return react < 0.4 ? 3 : 2;
  if (act === "triple") return react < 0.2 ? 2 : 3;
  if (act === "tspin") return react < 0.24 ? 2 : 3;
  if (act === "stack" || act === "perfect") return react % 0.38 < 0.18 ? 2 : 3;
  return 0;
}

const BITS: Bit[] = ["glance", "scratch", "hop", "peer"];

export function Mascots({
  act,
  worldRef,
}: {
  act: MascotAct;
  worldRef: RefObject<MascotWorld>;
}) {
  const soot = useRef<HTMLSpanElement>(null);
  const lumen = useRef<HTMLSpanElement>(null);
  const sootHead = useRef<HTMLElement>(null);
  const lumenHead = useRef<HTMLElement>(null);
  const sootFace = useRef<HTMLElement>(null);
  const lumenFace = useRef<HTMLElement>(null);
  const sootShadow = useRef<HTMLElement>(null);
  const lumenShadow = useRef<HTMLElement>(null);
  const sootGaze = useRef<HTMLElement>(null);
  const lumenGaze = useRef<HTMLElement>(null);
  const sootTrail = useRef<HTMLElement>(null);
  const lumenTrail = useRef<HTMLElement>(null);
  const sootDust = useRef<HTMLElement>(null);
  const lumenDust = useRef<HTMLElement>(null);
  const body = useRef({ soot: rest(), lumen: rest() });
  const head = useRef({ soot: rest(), lumen: rest() });
  const trail = useRef({ soot: rest(), lumen: rest() });
  const hop = useRef({ soot: spring0(), lumen: spring0() });
  const eye = useRef(0);
  const neck = useRef(0);
  const torso = useRef(0);
  const world = useRef(0);
  const last = useRef(performance.now());
  const recover = useRef(0);
  const bit = useRef<Bit>("none");
  const bitT = useRef(0);
  const nextBit = useRef(8 + Math.random() * 4);
  const fired = useRef(0);

  useEffect(() => {
    let raf = 0;
    let reactT = 0;
    fired.current = 0;
    last.current = performance.now();
    if (act === "recover") recover.current = 1.15;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last.current) / 1000);
      last.current = now;
      world.current += dt;
      if (act !== "idle" && act !== "recover") reactT += dt;
      recover.current = Math.max(0, recover.current - dt);

      const worldIn = worldRef.current ?? {
        look: 0,
        down: 0,
        duck: 0,
        asleep: false,
        shake: 0,
        sleepT: 0,
      };
      const want = worldIn.look;
      eye.current += (want - eye.current) * (1 - Math.exp(-dt * 18));
      neck.current += (eye.current - neck.current) * (1 - Math.exp(-dt * 8));
      torso.current += (neck.current - torso.current) * (1 - Math.exp(-dt * 5));

      const asleep = worldIn.asleep || act === "nap";
      const down = worldIn.down;
      const duck = worldIn.duck;

      if (act === "idle" && !asleep) {
        bitT.current += dt;
        if (bit.current === "none" && world.current > nextBit.current) {
          bit.current = BITS[(Math.random() * BITS.length) | 0] ?? "glance";
          bitT.current = 0;
          fired.current = 0;
        }
        if (bit.current !== "none" && bitT.current > 1.15) {
          bit.current = "none";
          nextBit.current = world.current + 7 + Math.random() * 6;
        }
      } else if (bit.current !== "none") {
        bit.current = "none";
      }

      const once = (mask: number, when: boolean, who: Who, impulse: number) => {
        if (!when || fired.current & mask) return;
        fired.current |= mask;
        kick(hop.current[who], impulse / MASS[who]);
      };
      const u = reactT;
      once(1, act === "single" && u > 0.08, "soot", -210);
      once(2, act === "single" && u > 0.12, "lumen", -240);
      once(4, act === "double" && u > 0.04, "soot", -280);
      once(8, act === "double" && u > 0.08, "lumen", -300);
      once(16, act === "double" && u > 0.4, "soot", -240);
      once(32, act === "double" && u > 0.44, "lumen", -260);
      once(64, act === "triple" && u > 0.14, "soot", -340);
      once(128, act === "triple" && u > 0.18, "lumen", -360);
      once(256, (act === "stack" || act === "perfect") && u > 0.04, "soot", -300);
      once(512, (act === "stack" || act === "perfect") && u > 0.08, "lumen", -320);
      once(1024, (act === "stack" || act === "perfect") && u > 0.4, "soot", -260);
      once(2048, (act === "stack" || act === "perfect") && u > 0.46, "lumen", -280);
      once(4096, (act === "stack" || act === "perfect") && u > 0.84, "soot", -340);
      once(8192, (act === "stack" || act === "perfect") && u > 0.9, "lumen", -360);
      once(16384, act === "tspin" && u > 0.16, "soot", -220);
      once(32768, act === "tspin" && u > 0.2, "lumen", -250);
      once(65536, act === "idle" && bit.current === "hop" && bitT.current > 0.06, "lumen", -220);
      once(1048576, act === "wake" && u > 0.08, "soot", -160);
      once(2097152, act === "wake" && u > 0.14, "lumen", -180);
      once(131072, act === "panic" && pulse(world.current % 1.45, 0.08, 0.2) > 0.85, "soot", -90);
      once(262144, act === "panic" && pulse(world.current % 1.45, 0.1, 0.22) > 0.85, "lumen", -100);

      const floor = act === "fail" ? 8 : 0;
      const g = act === "fail" ? 420 : 860;
      stepHop(hop.current.soot, hop.current.lumen, dt, floor, g * MASS.soot, MASS.soot);
      stepHop(hop.current.lumen, hop.current.soot, dt, floor, g * MASS.lumen, MASS.lumen);

      const w = world.current;
      const watching = act === "idle" || act === "recover" || act === "panic" || act === "nap";

      const sit = (who: Who) => {
        let to =
          act === "idle" || act === "recover" || act === "nap"
            ? idleTarget(who, w, recover.current, asleep, worldIn.sleepT)
            : { ...rest(), ...reactSpin(who, act, reactT, worldIn.sleepT) };
        if (act === "idle" && !asleep) to = add(to, bitOffset(who, bit.current, bitT.current));
        const h = hop.current[who];
        const air = h.y < -1;
        const ride = worldIn.shake;
        to.y += h.y + h.dip + duck * 5 + down * 1.4 + ride * 0.15;
        to.r += h.tilt + down * (who === "soot" ? 6 : -6) + ride * (who === "soot" ? -2.4 : 2.4);
        to.x += ride * (who === "soot" ? -0.55 : 0.55);
        to.sx *= 1 + h.squash * 0.2 - (air ? 0.04 : 0) + duck * 0.08;
        to.sy *= 1 - h.squash * 0.22 + (air ? 0.06 : 0) - duck * 0.12;
        if (watching && !asleep) {
          to.r += torso.current * 8;
          to.x += torso.current * (who === "soot" ? 2.2 : 1.6);
        }
        return to;
      };

      const posK = act === "idle" || act === "recover" ? 12 : 16;
      follow(body.current.soot, sit("soot"), dt, posK, 9);
      follow(body.current.lumen, sit("lumen"), dt, posK * 1.06, 9.4);
      const headGoal = (who: Who): Pose => {
        const b = body.current[who];
        const lead = watching ? (eye.current - torso.current) * 12 : 0;
        return { ...b, r: b.r + lead, y: b.y - 0.4 + down * 3.2 };
      };
      follow(head.current.soot, headGoal("soot"), dt, 8, 5);
      follow(head.current.lumen, headGoal("lumen"), dt, 8.6, 5.4);
      follow(trail.current.soot, body.current.soot, dt, 4.2, 3.1);
      follow(trail.current.lumen, body.current.lumen, dt, 3.6, 2.8);

      const apply = (
        wrap: HTMLSpanElement | null,
        hd: HTMLElement | null,
        face: HTMLElement | null,
        sh: HTMLElement | null,
        gz: HTMLElement | null,
        tr: HTMLElement | null,
        dust: HTMLElement | null,
        who: Who,
        b: Pose,
        h: Pose,
        tpose: Pose,
      ) => {
        if (wrap) wrap.style.transform = cssOf(b);
        const fr = SHEET[faceOf(who, act, w, reactT, bit.current)];
        if (face) face.style.backgroundPosition = fr;
        if (hd) {
          const sink = hop.current[who].squash * 3.2 + hop.current[who].dip * 0.25;
          hd.style.backgroundPosition = fr;
          hd.style.transform = `translate3d(${((eye.current - torso.current) * 1.4).toFixed(2)}px, ${(h.y - b.y + sink).toFixed(2)}px, 0) rotate(${(h.r - b.r).toFixed(2)}deg)`;
        }
        if (gz) {
          gz.style.transform = `translate3d(${(eye.current * 3.4).toFixed(2)}px, ${(Math.abs(eye.current) * -0.6 + down * 3.5).toFixed(2)}px, 0)`;
        }
        if (tr) {
          const flop = hop.current[who].squash * 22 + hop.current[who].dip * 1.4;
          const lagR = (tpose.r - b.r) * 1.4 + flop * (who === "soot" ? -1 : 1);
          const lagY = tpose.y - b.y + hop.current[who].squash * 2;
          tr.style.transform = `translate3d(0, ${lagY.toFixed(2)}px, 0) rotate(${lagR.toFixed(2)}deg)`;
        }
        if (sh) {
          const air = clamp(-b.y / 16);
          const squash = hop.current[who].squash;
          const wide = 0.82 + squash * 0.85 - air * 0.4;
          sh.style.transform = `scale(${wide.toFixed(3)}, ${(0.7 + squash * 0.45).toFixed(3)})`;
          sh.style.opacity = String((0.2 + squash * 0.35 + (1 - air) * 0.28).toFixed(3));
        }
        if (dust) {
          const d = hop.current[who].dust;
          dust.style.opacity = String(d.toFixed(3));
          dust.style.transform = `translateX(-50%) scale(${(0.6 + d * 1.8).toFixed(3)}, ${(0.5 + d * 0.8).toFixed(3)})`;
        }
      };

      apply(
        soot.current,
        sootHead.current,
        sootFace.current,
        sootShadow.current,
        sootGaze.current,
        sootTrail.current,
        sootDust.current,
        "soot",
        body.current.soot,
        head.current.soot,
        trail.current.soot,
      );
      apply(
        lumen.current,
        lumenHead.current,
        lumenFace.current,
        lumenShadow.current,
        lumenGaze.current,
        lumenTrail.current,
        lumenDust.current,
        "lumen",
        body.current.lumen,
        head.current.lumen,
        trail.current.lumen,
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [act, worldRef]);

  return (
    <div className={`mascots is-${act}`} aria-hidden="true">
      <span className="mascot-slot">
        <b ref={sootShadow} className="mascot-shadow" />
        <i ref={sootDust} className="mascot-dust" />
        <span ref={soot} className="mascot-wrap soot">
          <i ref={sootTrail} className="mascot-trail soot-ant" />
          <i ref={sootFace} className="mascot soot" />
          <i ref={sootHead} className="mascot-head soot" />
          <i ref={sootGaze} className="mascot-gaze" />
        </span>
      </span>
      <span className="mascot-slot">
        <b ref={lumenShadow} className="mascot-shadow" />
        <i ref={lumenDust} className="mascot-dust" />
        <span ref={lumen} className="mascot-wrap lumen">
          <i ref={lumenTrail} className="mascot-trail lumen-tuft" />
          <i ref={lumenFace} className="mascot lumen" />
          <i ref={lumenHead} className="mascot-head lumen" />
          <i ref={lumenGaze} className="mascot-gaze" />
        </span>
      </span>
    </div>
  );
}

export function mascotHold(act: MascotAct, sleepT = 0): number {
  if (act === "stack" || act === "perfect") return 1.55;
  if (act === "triple" || act === "tspin") return 1.15;
  if (act === "fail") return 1.3;
  if (act === "recover") return 1.15;
  if (act === "wake") return 0.55 + clamp(sleepT / 18) * 0.75;
  if (act === "bump") return 0.58;
  if (act === "double") return 0.95;
  if (act === "panic") return 0.7;
  if (act === "single") return 0.75;
  return 0;
}
