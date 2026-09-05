import { fits, type Sim } from "./sim";
import { COLS, HIDDEN_ROWS, ROWS } from "./types";

export type AimMode = "attackers" | "kos" | "badges" | "random";

export type Rival = {
  id: number;
  hp: number;
  max: number;
  badges: number;
  aimPlayer: boolean;
  cd: number;
  dead: boolean;
  tint: string;
};

export type Siege = {
  rivals: Rival[];
  aim: AimMode;
  badges: number;
  kos: number;
  incoming: number;
  hunters: number;
  dumpT: number;
  t: number;
};

const TINTS = ["#6ee0e4", "#e87870", "#e8c46a", "#b08ad4", "#78c47c", "#e09852", "#7eb4c8", "#ff8ad4"];

export function createSiege(): Siege {
  const rivals: Rival[] = Array.from({ length: 8 }, (_, i) => {
    const max = 10 + (i % 5);
    return {
      id: i,
      hp: max,
      max,
      badges: i === 3 || i === 6 ? 1 : 0,
      // One hunter at the start. The rest acquire you once the stack is high.
      aimPlayer: i === 0,
      cd: 7.2 + i * 2.1,
      dead: false,
      tint: TINTS[i]!,
    };
  });
  return {
    rivals,
    aim: "attackers",
    badges: 0,
    kos: 0,
    incoming: 0,
    hunters: rivals.filter((r) => r.aimPlayer).length,
    dumpT: 0,
    t: 0,
  };
}

export function badgeBoost(badges: number): number {
  if (badges >= 30) return 1;
  if (badges >= 14) return 0.75;
  if (badges >= 6) return 0.5;
  if (badges >= 2) return 0.25;
  return 0;
}

export function garbageFor(
  lines: number,
  tspin: boolean,
  b2b: boolean,
  combo: number,
  perfect: boolean,
  badges: number,
  hunters: number,
): number {
  let g = 0;
  if (tspin) g = lines === 1 ? 2 : lines === 2 ? 4 : lines === 3 ? 6 : 0;
  else g = lines === 2 ? 1 : lines === 3 ? 2 : lines === 4 ? 4 : 0;
  if (b2b && (lines === 4 || tspin) && lines > 0) g += 1;
  if (perfect) g += 4;
  const table = [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
  g += table[Math.min(Math.max(0, combo), 10)] ?? 5;
  g = Math.floor(g * (1 + Math.min(6, hunters) * 0.2));
  g = Math.floor(g * (1 + badgeBoost(badges)));
  return g;
}

export function cycleAim(s: Siege): AimMode {
  const order: AimMode[] = ["attackers", "kos", "badges", "random"];
  const i = order.indexOf(s.aim);
  s.aim = order[(i + 1) % order.length]!;
  return s.aim;
}

export function targetsOf(s: Siege): Rival[] {
  const live = s.rivals.filter((r) => !r.dead);
  if (live.length === 0) return [];
  if (s.aim === "attackers") {
    const a = live.filter((r) => r.aimPlayer);
    return a.length ? a : live.slice(0, 1);
  }
  if (s.aim === "kos") return [...live].sort((a, b) => a.hp / a.max - b.hp / b.max).slice(0, 2);
  if (s.aim === "badges") return [...live].sort((a, b) => b.badges - a.badges).slice(0, 2);
  return [live[Math.floor(Math.random() * live.length)]!];
}

export function sendGarbage(s: Siege, amount: number): number {
  if (amount <= 0) return 0;
  const marks = targetsOf(s);
  if (!marks.length) return 0;
  let left = amount;
  let kos = 0;
  for (const r of marks) {
    if (r.dead || left <= 0) continue;
    const hit = Math.min(r.hp, Math.max(1, Math.ceil(left / marks.length)));
    r.hp -= hit;
    left -= hit;
    if (r.hp <= 0) {
      r.dead = true;
      r.aimPlayer = false;
      s.badges += 1 + r.badges;
      r.badges = 0;
      kos += 1;
    }
  }
  s.kos += kos;
  s.hunters = s.rivals.filter((r) => !r.dead && r.aimPlayer).length;
  return kos;
}

/** How many guns can look at you. Time and KOs raise the cap — never eight at once. */
function hunterCap(s: Siege): number {
  const live = s.rivals.filter((r) => !r.dead).length;
  const byTime = s.t < 20 ? 1 : s.t < 40 ? 2 : s.t < 65 ? 3 : s.t < 95 ? 4 : 5;
  const byKos = s.kos < 1 ? 1 : s.kos < 3 ? 2 : s.kos < 6 ? 3 : s.kos < 10 ? 4 : 5;
  return Math.min(live, Math.max(byTime, byKos));
}

export function tickSiege(s: Siege, dt: number, stackHigh: boolean): number {
  s.t += dt;
  const cap = hunterCap(s);
  let hunters = s.rivals.filter((r) => !r.dead && r.aimPlayer).length;
  let incoming = 0;
  for (const r of s.rivals) {
    if (r.dead) continue;
    if (r.aimPlayer && hunters > cap) {
      r.aimPlayer = false;
      hunters -= 1;
    } else if (!r.aimPlayer && hunters < cap && Math.random() < dt * (stackHigh ? 0.07 : 0.022)) {
      r.aimPlayer = true;
      hunters += 1;
    }
    r.cd -= dt;
    if (r.cd > 0) continue;
    r.cd = s.t < 28 ? 5.4 + Math.random() * 2.4 : s.t < 55 ? 3.8 + Math.random() * 2.0 : 2.6 + Math.random() * 1.8;
    if (!r.aimPlayer) continue;
    const roll = Math.random();
    const shot =
      s.t < 22
        ? roll < 0.42
          ? 1
          : roll < 0.55
            ? 2
            : 0
        : s.t < 50
          ? roll < 0.38
            ? 1
            : roll < 0.6
              ? 2
              : roll < 0.68
                ? 3
                : 0
          : roll < 0.32
            ? 1
            : roll < 0.58
              ? 2
              : roll < 0.74
                ? 4
                : 0;
    if (shot > 0) incoming += Math.max(1, Math.floor(shot * (1 + badgeBoost(r.badges) * 0.45)));
  }
  s.incoming = Math.min(8, s.incoming + incoming);
  s.hunters = s.rivals.filter((r) => !r.dead && r.aimPlayer).length;
  return incoming;
}

export function takeIncoming(s: Siege, max = 2): number {
  const n = Math.min(max, s.incoming);
  s.incoming -= n;
  return n;
}

export function siegeWon(s: Siege): boolean {
  return s.rivals.every((r) => r.dead);
}

export function snapshotSiege(s: Siege) {
  return {
    aim: s.aim,
    badges: s.badges,
    kos: s.kos,
    incoming: s.incoming,
    hunters: s.hunters,
    boost: badgeBoost(s.badges),
    live: s.rivals.filter((r) => !r.dead).length,
    rivals: s.rivals.map((r) => ({
      id: r.id,
      hp: r.hp / r.max,
      badges: r.badges,
      aim: r.aimPlayer,
      dead: r.dead,
      tint: r.tint,
    })),
  };
}

export type SiegeSnap = ReturnType<typeof snapshotSiege>;

export function injectGarbage(sim: Sim, n: number): boolean {
  if (n <= 0) return true;
  if (sim.shield) {
    sim.shield = false;
    return true;
  }
  for (let i = 0; i < n; i++) {
    if (sim.board[HIDDEN_ROWS]!.some((c) => c !== null)) return false;
    const hole = Math.floor(sim.rng() * COLS);
    const row = Array.from({ length: COLS }, (_, x) => (x === hole ? null : ("J" as const)));
    sim.board.shift();
    sim.board.push(row);
    if (sim.board.length > ROWS) sim.board.length = ROWS;
  }
  if (sim.piece && !fits(sim.board, sim.piece)) {
    const p = { ...sim.piece, y: sim.piece.y - n };
    if (fits(sim.board, p)) sim.piece = p;
    else return false;
  }
  return true;
}