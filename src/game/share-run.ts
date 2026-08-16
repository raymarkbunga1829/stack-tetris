import { formatClock } from "./modes";
import { HIDDEN_ROWS, VISIBLE_ROWS, COLS, type PieceId } from "./types";
import { PIECE_FILL } from "./pieces";
import type { Snap } from "./replay";

export type SharePayload = {
  mode: string;
  score: number;
  lines: number;
  combo: number;
  clock: number;
  splits?: number[];
  frames?: Snap[];
};

export async function shareRun(run: SharePayload): Promise<void> {
  const text = [
    `Stack · ${run.mode}`,
    `${run.score.toLocaleString()} · ${run.lines}L · x${run.combo}`,
    run.splits?.length
      ? run.splits.map((s, i) => `${(i + 1) * 10} ${formatClock(s)}`).join(" · ")
      : formatClock(run.clock),
  ].join("\n");

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#0b0c10";
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = "#16181f";
    roundRect(ctx, 72, 88, 936, 1170, 36);
    ctx.fill();
    ctx.fillStyle = "#8b8d96";
    ctx.font = "600 32px system-ui, sans-serif";
    ctx.fillText(run.mode.toUpperCase(), 120, 180);
    ctx.fillStyle = "#f2efe6";
    ctx.font = "700 96px system-ui, sans-serif";
    ctx.fillText(run.score.toLocaleString(), 120, 300);
    ctx.font = "600 36px system-ui, sans-serif";
    ctx.fillStyle = "#c8c6bf";
    ctx.fillText(`${run.lines} lines · x${run.combo} · ${formatClock(run.clock)}`, 120, 360);

    const frames = pickFrames(run.frames);
    if (frames.length) {
      const fw = 200;
      const fh = 400;
      const gap = 24;
      const total = frames.length * fw + (frames.length - 1) * gap;
      let x = (1080 - total) / 2;
      frames.forEach((s) => {
        drawMini(ctx, s, x, 430, fw, fh);
        x += fw + gap;
      });
    } else if (run.splits?.length) {
      ctx.font = "600 32px system-ui, sans-serif";
      run.splits.forEach((s, i) => {
        ctx.fillText(`${(i + 1) * 10}  ${formatClock(s)}`, 120, 480 + i * 56);
      });
    }
    ctx.fillStyle = "#6a6d76";
    ctx.font = "600 28px system-ui, sans-serif";
    ctx.fillText("STACK", 120, 1200);
  }

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  const file = blob ? new File([blob], "stack-clip.png", { type: "image/png" }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: "Stack", text, files: [file] });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: "Stack", text });
      return;
    }
    await navigator.clipboard.writeText(text);
  } catch {
    /* cancel */
  }
}

function pickFrames(snaps?: Snap[]): Snap[] {
  if (!snaps || snaps.length < 2) return [];
  const last = snaps.length - 1;
  const idx = [0, Math.floor(last / 3), Math.floor((last * 2) / 3), last];
  return idx.map((i) => snaps[i]!);
}

function drawMini(
  ctx: CanvasRenderingContext2D,
  snap: Snap,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const cell = Math.min(w / COLS, h / VISIBLE_ROWS);
  const ox = x + (w - cell * COLS) / 2;
  const oy = y + (h - cell * VISIBLE_ROWS) / 2;
  ctx.fillStyle = "#0c0d12";
  ctx.fillRect(ox - 4, oy - 4, cell * COLS + 8, cell * VISIBLE_ROWS + 8);
  for (let r = 0; r < VISIBLE_ROWS; r++) {
    const row = snap.board[r + HIDDEN_ROWS];
    if (!row) continue;
    for (let c = 0; c < COLS; c++) {
      const id = row[c];
      ctx.fillStyle = id ? PIECE_FILL[id as PieceId] : (c + r) % 2 === 0 ? "#12141a" : "#16181f";
      ctx.fillRect(ox + c * cell, oy + r * cell, cell - 0.5, cell - 0.5);
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}