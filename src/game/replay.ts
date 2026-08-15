import type { Board, Piece } from "./sim";

export type Snap = {
  board: Board;
  piece: Piece | null;
  score: number;
  lines: number;
};

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

export function takeSnap(board: Board, piece: Piece | null, score: number, lines: number): Snap {
  return {
    board: cloneBoard(board),
    piece: piece ? { ...piece } : null,
    score,
    lines,
  };
}

export const REPLAY_CAP = 8;
export const REPLAY_STEP = 0.38;
