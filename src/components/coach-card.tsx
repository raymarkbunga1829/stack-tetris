export type CoachStep = "drag" | "rotate" | "hold";

const STEPS: {
  id: CoachStep;
  kicker: string;
  title: string;
  hint: string;
}[] = [
  {
    id: "drag",
    kicker: "1 of 3",
    title: "Drag the piece",
    hint: "Finger on the well. Slide left or right.",
  },
  {
    id: "rotate",
    kicker: "2 of 3",
    title: "Tap to rotate",
    hint: "Tap the well, or a rotate button.",
  },
  {
    id: "hold",
    kicker: "3 of 3",
    title: "Tap Hold",
    hint: "Use the Hold button to park a piece.",
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
      <p className="coach-hint">{cur.hint}</p>
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
    return "done";
  }
  return step;
}
