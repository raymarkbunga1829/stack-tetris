import type { MissionBook } from "@/game/missions";

export function MissionRow({ book }: { book: MissionBook }) {
  const items = book.items.length
    ? book.items
    : [
        { id: "a", label: "Daily goal", progress: 0, target: 1, done: false, reward: 0 },
        { id: "b", label: "Daily goal", progress: 0, target: 1, done: false, reward: 0 },
        { id: "c", label: "Daily goal", progress: 0, target: 1, done: false, reward: 0 },
      ];
  return (
    <ul className="missions" aria-label="Daily missions">
      {items.map((m) => (
        <li key={m.id} className={m.done ? "is-done" : ""}>
          <span>{m.label}</span>
          {m.reward > 0 && (
            <em>
              {m.done ? "Paid" : "Pays"} {m.reward} CR
            </em>
          )}
          <b>{m.done ? "Done" : `${m.progress}/${m.target}`}</b>
        </li>
      ))}
    </ul>
  );
}
