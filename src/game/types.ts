export type PieceId = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type Rot = 0 | 1 | 2 | 3;
export type Phase = "title" | "playing" | "paused" | "clearing" | "over";
export type Cell = { x: number; y: number };

export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 2;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export const PIECE_IDS: PieceId[] = ["I", "O", "T", "S", "Z", "J", "L"];

export const LOCK_DELAY = 0.5;
export const MAX_LOCK_RESETS = 15;
export const DAS = 0.167;
export const DAS_TOUCH = 0.1;
export const ARR = 0.033;
export const CLEAR_TIME = 0.32;
export const LINES_PER_LEVEL = 10;

export const LINE_SCORE = [0, 100, 300, 500, 800] as const;
export const T_SPIN_SCORE = [400, 800, 1200, 1600] as const;
export const COMBO_SCORE = 50;

export type HighKey = string;
