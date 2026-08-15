import { ensureMissions, emptyBook, type MissionBook } from "./missions";
import type { ModeId } from "./modes";
import { emptyInv, type Inventory, type Receipt } from "./shop";
import type { ThemeId } from "./themes";

const KEY = "stack-tetris-v1";
const SAVE_VERSION = 3;

export type HapticProfile = "full" | "light" | "off";

export type ScoreRow = {
  mode: ModeId;
  score: number;
  lines: number;
  clock: number;
  won: boolean;
  t: number;
};

export type SaveData = {
  version: number;
  high: number;
  muted: boolean;
  drag: boolean;
  credits: number;
  inv: Inventory;
  receipts: Receipt[];
  hardConfirm: boolean;
  haptic: HapticProfile;
  theme: ThemeId;
  themes: ThemeId[];
  onboarded: boolean;
  mode: ModeId;
  missions: MissionBook;
  scores: ScoreRow[];
  daily: { date: string; score: number; lines: number };
};

const DEFAULTS: SaveData = {
  version: SAVE_VERSION,
  high: 0,
  muted: false,
  drag: true,
  credits: 80,
  inv: { zap: 1, slow: 1, shield: 0, quake: 0, pick: 1 },
  receipts: [],
  hardConfirm: false,
  haptic: "full",
  theme: "ink",
  themes: ["ink"],
  onboarded: false,
  mode: "marathon",
  missions: emptyBook(),
  scores: [],
  daily: { date: "", score: 0, lines: 0 },
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
      credits: Math.max(0, parsed.credits ?? DEFAULTS.credits),
      inv: { ...emptyInv(), ...parsed.inv },
      receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
      hardConfirm: parsed.hardConfirm === true,
      haptic: parsed.haptic === "light" || parsed.haptic === "off" ? parsed.haptic : "full",
      theme: parsed.theme ?? "ink",
      themes: Array.isArray(parsed.themes) ? (parsed.themes as ThemeId[]) : ["ink"],
      onboarded: parsed.onboarded === true,
      mode: parsed.mode ?? "marathon",
      missions: ensureMissions(parsed.missions),
      scores: Array.isArray(parsed.scores) ? parsed.scores : [],
      daily: parsed.daily ?? { date: "", score: 0, lines: 0 },
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
  if (row.mode === "daily") {
    next = {
      ...next,
      daily: {
        date: data.missions.date,
        score: Math.max(data.daily.score, row.score),
        lines: Math.max(data.daily.lines, row.lines),
      },
    };
  }
  writeSave(next);
  return next;
}
