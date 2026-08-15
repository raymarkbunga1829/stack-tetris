import { utcDateKey, hashSeed, type ModeId } from "./modes";

export type MissionKind = "tetris" | "hold" | "level" | "lines" | "sprint";

export type Mission = {
  id: string;
  kind: MissionKind;
  label: string;
  target: number;
  progress: number;
  done: boolean;
  reward: number;
};

export type MissionBook = {
  date: string;
  items: Mission[];
};

const POOL: Omit<Mission, "id" | "progress" | "done">[] = [
  { kind: "tetris", label: "Clear 3 STACKS", target: 3, reward: 60 },
  { kind: "hold", label: "Hold a piece", target: 1, reward: 50 },
  { kind: "level", label: "Reach level 8", target: 8, reward: 80 },
  { kind: "lines", label: "Clear 25 lines", target: 25, reward: 50 },
  { kind: "sprint", label: "Finish a Sprint 40", target: 1, reward: 70 },
];

export function emptyBook(): MissionBook {
  return { date: "", items: [] };
}

export function dailyMissions(date = utcDateKey()): MissionBook {
  const seed = hashSeed(`stack-missions-${date}`);
  const order = [0, 1, 2, 3, 4];
  for (let i = order.length - 1; i > 0; i--) {
    seed;
    const j = (hashSeed(`${date}-${i}`) + i * 7) % (i + 1);
    const t = order[i]!;
    order[i] = order[j]!;
    order[j] = t;
  }
  return {
    date,
    items: order.slice(0, 3).map((i) => {
      const p = POOL[i]!;
      return {
        id: `${date}-${p.kind}`,
        kind: p.kind,
        label: p.label,
        target: p.target,
        progress: 0,
        done: false,
        reward: p.reward,
      };
    }),
  };
}

export function ensureMissions(book: MissionBook | undefined): MissionBook {
  const today = utcDateKey();
  if (!book || book.date !== today || book.items.length < 3) return dailyMissions(today);
  return book;
}

export type MissionEv = {
  tetris?: number;
  hold?: number;
  level?: number;
  lines?: number;
  modeWin?: ModeId;
};

export function applyMissions(
  book: MissionBook,
  ev: MissionEv,
): { book: MissionBook; payout: number; done: string[] } {
  let payout = 0;
  const done: string[] = [];
  const items = book.items.map((m) => {
    if (m.done) return m;
    let add = 0;
    if (m.kind === "tetris") add = ev.tetris ?? 0;
    if (m.kind === "hold") add = ev.hold ?? 0;
    if (m.kind === "level") {
      const next = Math.max(m.progress, ev.level ?? 0);
      const copy = { ...m, progress: Math.min(m.target, next) };
      if (copy.progress >= m.target) {
        copy.done = true;
        payout += m.reward;
        done.push(m.label);
      }
      return copy;
    }
    if (m.kind === "lines") add = ev.lines ?? 0;
    if (m.kind === "sprint") add = ev.modeWin === "sprint" ? 1 : 0;
    if (!add) return m;
    const progress = Math.min(m.target, m.progress + add);
    const finished = progress >= m.target;
    if (finished) {
      payout += m.reward;
      done.push(m.label);
    }
    return { ...m, progress, done: finished };
  });
  return { book: { ...book, items }, payout, done };
}
