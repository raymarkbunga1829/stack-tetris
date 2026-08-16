import { SHAPES } from "@/game/pieces";
import { GEM_NAME, themeOf, type ThemeId } from "@/game/themes";
import type { PieceId } from "@/game/types";

export function MiniPiece({ id, theme }: { id: PieceId | null; theme?: ThemeId }) {
  if (!id) {
    return <div className="mini empty" aria-hidden="true" />;
  }
  const cells = SHAPES[id][0]!;
  const maxX = Math.max(...cells.map((c) => c.x));
  const maxY = Math.max(...cells.map((c) => c.y));
  const w = maxX + 1;
  const h = maxY + 1;
  const skin = themeOf(theme);
  const fill = skin.fill[id];
  const deep = skin.deep[id];
  return (
    <div
      className="mini"
      style={{
        gridTemplateColumns: `repeat(${w}, 1fr)`,
        gridTemplateRows: `repeat(${h}, 1fr)`,
        aspectRatio: `${w} / ${h}`,
      }}
      aria-label={GEM_NAME[id]}
    >
      {cells.map((c, i) => (
        <span
          key={i}
          className="mini-cell"
          style={{
            gridColumn: c.x + 1,
            gridRow: c.y + 1,
            background: fill,
            ["--gem" as string]: fill,
            ["--gem-deep" as string]: deep,
          }}
        />
      ))}
    </div>
  );
}