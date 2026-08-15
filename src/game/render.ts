import { cellsOf } from "./pieces";
import { ghostY, type Sim } from "./sim";
import { themeOf, type Theme } from "./themes";
import { COLS, HIDDEN_ROWS, VISIBLE_ROWS, type PieceId } from "./types";

export function fieldLayout(width: number, height: number) {
  const pad = Math.max(2, Math.floor(Math.min(width, height) * 0.02));
  const cell = Math.max(
    4,
    Math.floor(Math.min((width - pad * 2) / COLS, (height - pad * 2) / VISIBLE_ROWS)),
  );
  const fieldW = cell * COLS;
  const fieldH = cell * VISIBLE_ROWS;
  const ox = Math.floor((width - fieldW) / 2);
  const oy = Math.floor((height - fieldH) / 2);
  return { cell, ox, oy, fieldW, fieldH };
}

export function clientToCell(
  rect: DOMRect,
  clientX: number,
  clientY: number,
): { col: number; row: number } {
  const { cell, ox, oy } = fieldLayout(rect.width, rect.height);
  return {
    col: Math.floor((clientX - rect.left - ox) / cell),
    row: Math.floor((clientY - rect.top - oy) / cell),
  };
}

export function resizeCanvas(canvas: HTMLCanvasElement) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  const cssW = `${w}px`;
  const cssH = `${h}px`;
  if (canvas.style.width !== cssW) canvas.style.width = cssW;
  if (canvas.style.height !== cssH) canvas.style.height = cssH;
  const bw = Math.floor(w * dpr);
  const bh = Math.floor(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
}

export function drawWell(
  canvas: HTMLCanvasElement,
  sim: Sim | null,
  shake = 0,
  theme: Theme = themeOf("ink"),
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = theme.well;
  ctx.fillRect(0, 0, w, h);

  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  const { cell, ox, oy, fieldW, fieldH } = fieldLayout(w, h);

  ctx.fillStyle = theme.pit;
  ctx.fillRect(ox - 1, oy - 1, fieldW + 2, fieldH + 2);

  for (let y = 0; y < VISIBLE_ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? theme.well : theme.grid;
      ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    }
  }

  if (!sim) {
    frame(ctx, ox, oy, fieldW, fieldH, theme.frame);
    return;
  }

  for (let y = HIDDEN_ROWS; y < HIDDEN_ROWS + VISIBLE_ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = sim.board[y]![x];
      if (!id) continue;
      const flashing = sim.phase === "clearing" && sim.clearRows.includes(y);
      drawBlock(
        ctx,
        ox + x * cell,
        oy + (y - HIDDEN_ROWS) * cell,
        cell,
        flashing ? "flash" : id,
        theme,
      );
    }
  }

  if (sim.piece && sim.phase !== "over") {
    const gy = ghostY(sim);
    if (gy !== sim.piece.y) {
      for (const c of cellsOf(sim.piece.id, sim.piece.rot, sim.piece.x, gy)) {
        const vy = c.y - HIDDEN_ROWS;
        if (vy < 0 || vy >= VISIBLE_ROWS) continue;
        ghostBlock(ctx, ox + c.x * cell, oy + vy * cell, cell, theme);
      }
    }
    if (sim.phase !== "clearing") {
      for (const c of cellsOf(
        sim.piece.id,
        sim.piece.rot,
        sim.piece.x,
        sim.piece.y,
      )) {
        const vy = c.y - HIDDEN_ROWS;
        if (vy < 0 || vy >= VISIBLE_ROWS) continue;
        drawBlock(ctx, ox + c.x * cell, oy + vy * cell, cell, sim.piece.id, theme);
      }
    }
  }

  frame(ctx, ox, oy, fieldW, fieldH, theme.frame);
}

function frame(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) * 0.012));
  ctx.strokeRect(ox + 0.5, oy + 0.5, w - 1, h - 1);
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  id: PieceId | "flash",
  theme: Theme,
) {
  const inset = Math.max(1, Math.floor(cell * 0.08));
  if (id === "flash") {
    ctx.fillStyle = theme.flash;
    ctx.fillRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2);
    return;
  }
  ctx.fillStyle = theme.deep[id];
  ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
  ctx.fillStyle = theme.fill[id];
  ctx.fillRect(x + inset, y + inset, cell - inset * 2 - 1, cell - inset * 2 - 1);
}

function ghostBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  theme: Theme,
) {
  const inset = Math.max(1, Math.floor(cell * 0.18));
  ctx.strokeStyle = theme.ghost;
  ctx.lineWidth = Math.max(1, Math.floor(cell * 0.08));
  ctx.strokeRect(
    x + inset + 0.5,
    y + inset + 0.5,
    cell - inset * 2 - 1,
    cell - inset * 2 - 1,
  );
}
