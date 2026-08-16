export type MascotAct =
  | "idle"
  | "single"
  | "double"
  | "triple"
  | "stack"
  | "tspin"
  | "perfect"
  | "panic"
  | "fail";

export function Mascots({ act }: { act: MascotAct }) {
  return (
    <div className={`mascots is-${act}`} aria-hidden="true">
      <span className="mascot-wrap soot">
        <i className="mascot soot" />
      </span>
      <span className="mascot-wrap lumen">
        <i className="mascot lumen" />
      </span>
    </div>
  );
}

export function mascotHold(act: MascotAct): number {
  if (act === "stack" || act === "perfect") return 1.45;
  if (act === "triple" || act === "tspin") return 1.08;
  if (act === "fail") return 1.25;
  if (act === "double") return 0.82;
  if (act === "panic") return 0.55;
  if (act === "single") return 0.7;
  return 0;
}
