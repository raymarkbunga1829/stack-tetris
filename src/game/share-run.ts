import { formatClock } from "./modes";

export type SharePayload = {
  mode: string;
  score: number;
  lines: number;
  combo: number;
  clock: number;
  splits?: number[];
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
    roundRect(ctx, 72, 120, 936, 1110, 36);
    ctx.fill();
    ctx.fillStyle = "#8b8d96";
    ctx.font = "600 36px system-ui, sans-serif";
    ctx.fillText(run.mode.toUpperCase(), 120, 240);
    ctx.fillStyle = "#f2efe6";
    ctx.font = "700 120px system-ui, sans-serif";
    ctx.fillText(run.score.toLocaleString(), 120, 400);
    ctx.font = "600 42px system-ui, sans-serif";
    ctx.fillStyle = "#c8c6bf";
    ctx.fillText(`${run.lines} lines`, 120, 500);
    ctx.fillText(`Best combo  x${run.combo}`, 120, 570);
    ctx.fillText(formatClock(run.clock), 120, 640);
    if (run.splits?.length) {
      ctx.font = "600 32px system-ui, sans-serif";
      run.splits.forEach((s, i) => {
        ctx.fillText(`${(i + 1) * 10}  ${formatClock(s)}`, 120, 760 + i * 56);
      });
    }
    ctx.fillStyle = "#6a6d76";
    ctx.font = "600 28px system-ui, sans-serif";
    ctx.fillText("STACK", 120, 1160);
  }

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  const file = blob ? new File([blob], "stack-run.png", { type: "image/png" }) : null;
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
