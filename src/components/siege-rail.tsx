import type { AimMode, SiegeSnap } from "@/game/siege";

const AIM: Record<AimMode, string> = {
  attackers: "Attackers",
  kos: "KOs",
  badges: "Badges",
  random: "Random",
};

export function SiegeRail({
  snap,
  onAim,
}: {
  snap: SiegeSnap;
  onAim: () => void;
}) {
  return (
    <div className="siege" aria-label="Siege">
      <button type="button" className="siege-aim" onPointerDown={(e) => { e.preventDefault(); onAim(); }}>
        {AIM[snap.aim]}
        <span>
          {snap.kos} KO · {Math.round(snap.boost * 100)}% · {snap.incoming} in
        </span>
      </button>
      <ul className="siege-list">
        {snap.rivals.map((r) => (
          <li
            key={r.id}
            className={`${r.dead ? "is-dead" : ""}${r.aim ? " is-hunt" : ""}`}
            style={{ ["--tint" as string]: r.tint }}
          >
            <i style={{ height: `${Math.max(8, r.hp * 100)}%` }} />
          </li>
        ))}
      </ul>
    </div>
  );
}