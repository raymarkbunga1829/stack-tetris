import { isAndroid } from "@/game/device";

export type CoachStep = "drag" | "rotate" | "hold" | "drop";

const STEPS: {
  id: CoachStep;
  kicker: string;
  title: string;
  hint: string;
  android: string;
}[] = [
  {
    id: "drag",
    kicker: "1 of 4",
    title: "Slide sideways",
    hint: "Finger on the well. Slide left or right.",
    android: "One thumb on the stack. Slide only left or right — not down.",
  },
  {
    id: "rotate",
    kicker: "2 of 4",
    title: "Tap to rotate",
    hint: "Tap the well, or a rotate button.",
    android: "Tap the stack once to turn. Use the rotate buttons if the tap misses.",
  },
  {
    id: "hold",
    kicker: "3 of 4",
    title: "Park a piece",
    hint: "Use the Hold button to park a piece.",
    android: "Hold parks it. Soft is the down arrow.",
  },
  {
    id: "drop",
    kicker: "4 of 4",
    title: "Slam it",
    hint: "White Drop slams the piece to the floor.",
    android: "White Drop slams. Don’t swipe down unless you turned that on.",
  },
];

type Props = {
  step: CoachStep;
  onSkip: () => void;
};

export function CoachCard({ step, onSkip }: Props) {
  const i = STEPS.findIndex((s) => s.id === step);
  const cur = STEPS[i] ?? STEPS[0]!;
  return (
    <div className="coach-card" role="status">
      <div className="coach-dots" aria-hidden="true">
        {STEPS.map((s) => (
          <span
            key={s.id}
            className={`coach-dot${s.id === step ? " is-on" : ""}`}
          />
        ))}
      </div>
      <p className="coach-kicker">{cur.kicker}</p>
      <p className="coach-title">{cur.title}</p>
      <p className="coach-hint">{isAndroid() ? cur.android : cur.hint}</p>
      <button
        type="button"
        className="coach-skip"
        onPointerDown={(e) => {
          e.stopPropagation();
          onSkip();
        }}
      >
        Skip
      </button>
    </div>
  );
}

export function nextCoach(step: CoachStep, label: string): CoachStep | "done" {
  if (step === "drag" && (label === "drag" || label === "swipe" || label === "left" || label === "right")) {
    return "rotate";
  }
  if (step === "rotate" && (label === "tap" || label === "two-finger" || label === "cw" || label === "ccw")) {
    return "hold";
  }
  if (step === "hold" && (label === "hold" || label === "long-press")) {
    return "drop";
  }
  if (step === "drop" && (label === "hard" || label === "flick")) {
    return "done";
  }
  return step;
}
