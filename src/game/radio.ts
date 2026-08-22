/**
 * What is on the cabinet radio. Ten beds, all cut from the same pulse engine as
 * the rest of the sound, plus Auto — the dial every save sat on until now, where
 * the mode you started picks the tune for you.
 */

/** A bed the music pump can play. The notes themselves live with the engine, in audio.ts. */
export type BedId =
  | "marathon"
  | "sprint"
  | "blitz"
  | "daily"
  | "arcade"
  | "classic"
  | "zen"
  | "finesse"
  | "ghost"
  | "lastcall";

export type StationId = "auto" | BedId;

export type Station = {
  id: StationId;
  name: string;
  blurb: string;
};

export const STATIONS: Station[] = [
  {
    id: "auto",
    name: "Auto",
    blurb: "House pick. Whichever bed the mode you started came with.",
  },
  {
    id: "marathon",
    name: "Long Haul",
    blurb: "Patient and level. Made for a stack that runs all night.",
  },
  {
    id: "sprint",
    name: "Pace Car",
    blurb: "Light on its feet. Keeps a step ahead of the clock.",
  },
  {
    id: "blitz",
    name: "Redline",
    blurb: "Sharp and fast, a whole tone up. Nerves in the last minute.",
  },
  {
    id: "daily",
    name: "Dawn Shift",
    blurb: "Bright and brief. The one that is on when the day rolls over.",
  },
  {
    id: "arcade",
    name: "Token Row",
    blurb: "Bouncy. Sounds like a room with too many cabinets in it.",
  },
  {
    id: "classic",
    name: "Old Cabinet",
    blurb: "Fat square wave. The bed that came in the box.",
  },
  {
    id: "zen",
    name: "Still Water",
    blurb: "Slow, wide notes and long gaps. Nothing to beat.",
  },
  {
    id: "finesse",
    name: "Clean Hands",
    blurb: "Tidy and stepwise. Good company for a quiet run.",
  },
  {
    id: "ghost",
    name: "Ghost Light",
    blurb: "A low hum for the empty floor after close.",
  },
  {
    id: "lastcall",
    name: "Last Call",
    blurb: "Warm and slack. The hour before the lights come up.",
  },
];

export function stationOf(id: StationId | string | undefined): Station {
  return STATIONS.find((s) => s.id === id) ?? STATIONS[0]!;
}

export function isStation(id: unknown): id is StationId {
  return typeof id === "string" && STATIONS.some((s) => s.id === id);
}
