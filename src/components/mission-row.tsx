import type { MissionBook } from "@/game/missions";

export function MissionRow({ book }: { book: MissionBook }) {
  if (!book.items.length) return null;
  return (
    <ul className="missions" aria-label="Daily missions">
      {book.items.map((m) => (
        <li key={m.id} className={m.done ? "is-done" : ""}>
          <span>{m.label}</span>
          <b>
            {m.done ? "Done" : `${m.progress}/${m.target}`}
          </b>
        </li>
      ))}
    </ul>
  );
}
