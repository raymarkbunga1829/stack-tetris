import { ensureMissions, emptyBook, type MissionBook } from "./missions";
import { utcDateKey, utcShift, type ModeId } from "./modes";
import { emptyInv, type Inventory, type Receipt } from "./shop";
import type { ThemeId } from "./themes";
import type { PadMode } from "./device";

const KEY = "stack-tetris-v1";
const SAVE_VERSION = 4;

export type HapticProfile = "full" | "light" | "off";

export type ScoreRow = {
  mode: ModeId;
  score: number;
  lines: number;
  clock: number;
  won: boolean;
  t: number;
  combo?: number;
  tspins?: number;
  stacks?: number;
};

export type SaveData = {
  version: number;
  high: number;
  muted: boolean;
  musicVol: number;
  sfxVol: number;
  drag: boolean;
  credits: number;
  inv: Inventory;
  receipts: Receipt[];
  hardConfirm: boolean;
  ghost: boolean;
  haptic: HapticProfile;
  theme: ThemeId;
  themes: ThemeId[];
  onboarded: boolean;
  tipSeen: boolean;
  padMode: PadMode;
  padSize: "compact" | "huge";
  marks: boolean;
  mode: ModeId;
  missions: MissionBook;
  scores: ScoreRow[];
  daily: { date: string; score: number; lines: number };
  sprintBest: number | null;
  dailyBoard: { date: string; rows: ScoreRow[] };
  streak: { count: number; last: string };
};

const DEFAULTS: SaveData = {
  version: SAVE_VERSION,
  high: 0,
  muted: false,
  musicVol: 1,
  sfxVol: 1,
  drag: true,
  credits: 80,
  inv: { zap: 1, slow: 1, shield: 0, quake: 0, pick: 1 },
  receipts: [],
  hardConfirm: false,
  ghost: true,
  haptic: "full",
  theme: "ink",
  themes: ["ink"],
  onboarded: false,
  tipSeen: false,
  padMode: "auto",
  padSize: "compact",
  marks: false,
  mode: "marathon",
  missions: emptyBook(),
  scores: [],
  daily: { date: "", score: 0, lines: 0 },
  sprintBest: null,
  dailyBoard: { date: "", rows: [] },
  streak: { count: 0, last: "" },
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return {
        ...DEFAULTS,
        inv: { ...DEFAULTS.inv },
        themes: [...DEFAULTS.themes],
        missions: ensureMissions(undefined),
      };
    }
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...DEFAULTS,
      ...parsed,
      version: SAVE_VERSION,
      high: Math.max(0, parsed.high ?? 0),
      drag: parsed.drag !== false,
      musicVol:
        typeof parsed.musicVol === "number"
          ? Math.max(0, Math.min(1, parsed.musicVol))
          : parsed.muted
            ? 0
            : 1,
      sfxVol:
        typeof parsed.sfxVol === "number"
          ? Math.max(0, Math.min(1, parsed.sfxVol))
          : parsed.muted
            ? 0
            : 1,
      credits: Math.max(0, parsed.credits ?? DEFAULTS.credits),
      inv: { ...emptyInv(), ...parsed.inv },
      receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
      hardConfirm: parsed.hardConfirm === true,
      ghost: parsed.ghost !== false,
      haptic: parsed.haptic === "light" || parsed.haptic === "off" ? parsed.haptic : "full",
      theme: parsed.theme ?? "ink",
      themes: Array.isArray(parsed.themes) ? (parsed.themes as ThemeId[]) : ["ink"],
      onboarded: parsed.onboarded === true,
      tipSeen: parsed.tipSeen === true,
      padMode:
        parsed.padMode === "on" || parsed.padMode === "off" || parsed.padMode === "auto"
          ? parsed.padMode
          : "auto",
      padSize: parsed.padSize === "huge" ? "huge" : "compact",
      marks: parsed.marks === true,
      mode: parsed.mode ?? "marathon",
      missions: ensureMissions(parsed.missions),
      scores: Array.isArray(parsed.scores) ? parsed.scores : [],
      daily: parsed.daily ?? { date: "", score: 0, lines: 0 },
      sprintBest: typeof parsed.sprintBest === "number" ? parsed.sprintBest : null,
      dailyBoard: parsed.dailyBoard ?? { date: "", rows: [] },
      streak: parsed.streak ?? { count: 0, last: "" },
    };
  } catch {
    return { ...DEFAULTS, inv: { ...DEFAULTS.inv }, missions: ensureMissions(undefined) };
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  } catch {
    /* quota / private */
  }
}

export function recordHigh(data: SaveData, score: number): SaveData {
  const next = { ...data, high: Math.max(data.high, score) };
  writeSave(next);
  return next;
}

export function recordRun(data: SaveData, row: ScoreRow): SaveData {
  const scores = [row, ...data.scores]
    .sort((a, b) => b.score - a.score || a.clock - b.clock)
    .slice(0, 30);
  let next: SaveData = { ...data, scores, high: Math.max(data.high, row.score) };
  if (row.mode === "sprint" && row.won) {
    const best = next.sprintBest;
    if (best == null || row.clock < best) next = { ...next, sprintBest: row.clock };
  }
  if (row.mode === "daily") {
    const date = data.missions.date;
    const prev = next.dailyBoard.date === date ? next.dailyBoard.rows : [];
    const rows = [row, ...prev]
      .sort((a, b) => b.score - a.score || a.clock - b.clock)
      .slice(0, 10);
    next = {
      ...next,
      daily: {
        date,
        score: Math.max(data.daily.date === date ? data.daily.score : 0, row.score),
        lines: Math.max(data.daily.date === date ? data.daily.lines : 0, row.lines),
      },
      dailyBoard: { date, rows },
    };
  }
  if (row.mode === "daily") {
    const today = utcDateKey();
    const prev = next.streak;
    let count = 1;
    if (prev.last === today) count = Math.max(1, prev.count);
    else if (prev.last === utcShift(-1, today)) count = prev.count + 1;
    next = { ...next, streak: { count, last: today } };
  }
  writeSave(next);
  return next;
}
