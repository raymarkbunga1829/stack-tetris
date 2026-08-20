import { useCallback, useRef, useState } from "react";

type HoldKey = "left" | "right" | "down";

type Props = {
  onHold: (key: HoldKey, down: boolean) => void;
  onCw: () => void;
  onCcw: () => void;
  onFlip?: () => void;
  onHard: () => void;
  onHoldPiece?: () => void;
  onUndo?: () => void;
  slam?: number;
  spent?: boolean;
  dropAsk?: boolean;
};

function Icon({ d, label }: { d: string; label: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <title>{label}</title>
      <path fill="currentColor" d={d} />
    </svg>
  );
}

const ICO = {
  left: "M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H19a1 1 0 1 1 0 2h-8.6l4.3 4.3a1 1 0 1 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0z",
  right:
    "M9.3 5.3a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4l-6 6a1 1 0 1 1-1.4-1.4l4.3-4.3H5a1 1 0 1 1 0-2h8.6L9.3 6.7a1 1 0 0 1 0-1.4z",
  down: "M5.3 9.3a1 1 0 0 1 1.4 0L11 13.6V5a1 1 0 1 1 2 0v8.6l4.3-4.3a1 1 0 1 1 1.4 1.4l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.4z",
  cw: "M12 5a7 7 0 1 1-6.3 4 1 1 0 1 1 1.8.8A5 5 0 1 0 12 7V9l3.5-2.5L12 4v1z",
  ccw: "M12 5V4L8.5 6.5 12 9V7a5 5 0 1 0 4.5 2.8 1 1 0 1 1 1.8-.8A7 7 0 1 1 12 5z",
  drop: "M12 3a1 1 0 0 1 1 1v9.6l2.3-2.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L11 13.6V4a1 1 0 0 1 1-1zM5 19a1 1 0 1 1 0-2h14a1 1 0 1 1 0 2H5z",
  hold: "M5 6h14v2H5V6zm1 3h12v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9zm3 2v5h6v-5H9z",
  flip: "M7 7h4V5L5 9l6 4v-2h2.5A3.5 3.5 0 0 1 11 17H7v2h4a5.5 5.5 0 0 0 0-11H7zm10 10h-4v2l6-4-6-4v2h-2.5A3.5 3.5 0 0 1 13 7h4V5h-4a5.5 5.5 0 0 0 0 11h4z",
};

export function TouchPad({ onHold, onCw, onCcw, onFlip, onHard, onHoldPiece, onUndo, slam = 0, spent = false, dropAsk = false }: Props) {
  const [down, setDown] = useState<Partial<Record<HoldKey, boolean>>>({});
  const held = useRef<Set<HoldKey>>(new Set());

  const startHold = useCallback(
    (key: HoldKey) => (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already released */
      }
      if (held.current.has(key)) return;
      held.current.add(key);
      setDown((s) => ({ ...s, [key]: true }));
      onHold(key, true);
    },
    [onHold],
  );

  const endHold = useCallback(
    (key: HoldKey) => (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!held.current.has(key)) return;
      held.current.delete(key);
      setDown((s) => ({ ...s, [key]: false }));
      onHold(key, false);
    },
    [onHold],
  );

  const tap =
    (fn: () => void) => (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    };

  return (
    <div className="pad" role="group" aria-label="Touch controls">
      <div className="pad-move">
        <button
          type="button"
          className={`pad-btn${down.left ? " is-down" : ""}`}
          aria-label="Move left"
          data-qa="pad-left"
          onPointerDown={startHold("left")}
          onPointerUp={endHold("left")}
          onPointerCancel={endHold("left")}
          onLostPointerCapture={endHold("left")}
        >
          <Icon d={ICO.left} label="Left" />
          <span>Left</span>
        </button>
        <button
          type="button"
          className={`pad-btn${down.down ? " is-down" : ""}`}
          aria-label="Soft drop"
          onPointerDown={startHold("down")}
          onPointerUp={endHold("down")}
          onPointerCancel={endHold("down")}
          onLostPointerCapture={endHold("down")}
        >
          <Icon d={ICO.down} label="Soft drop" />
          <span>Soft</span>
        </button>
        <button
          type="button"
          className={`pad-btn${down.right ? " is-down" : ""}`}
          aria-label="Move right"
          data-qa="pad-right"
          onPointerDown={startHold("right")}
          onPointerUp={endHold("right")}
          onPointerCancel={endHold("right")}
          onLostPointerCapture={endHold("right")}
        >
          <Icon d={ICO.right} label="Right" />
          <span>Right</span>
        </button>
      </div>
      <div className="pad-act">
        <button
          type="button"
          className="pad-btn"
          aria-label="Rotate left"
          onPointerDown={tap(onCcw)}
        >
          <Icon d={ICO.ccw} label="Rotate left" />
          <span>CCW</span>
        </button>
        <button
          type="button"
          className="pad-btn"
          aria-label="Rotate right"
          data-qa="pad-cw"
          onPointerDown={tap(onCw)}
        >
          <Icon d={ICO.cw} label="Rotate right" />
          <span>CW</span>
        </button>
        <button
          type="button"
          className="pad-btn"
          aria-label="Rotate 180"
          data-qa="pad-flip"
          onPointerDown={tap(() => onFlip?.())}
        >
          <Icon d={ICO.flip} label="Rotate 180" />
          <span>180</span>
        </button>
        <button
          type="button"
          className={`pad-btn pad-hold${spent ? " is-spent" : ""}`}
          aria-label="Hold piece"
          data-qa="pad-hold"
          onPointerDown={tap(() => onHoldPiece?.())}
        >
          <Icon d={ICO.hold} label="Hold" />
          <span>Hold</span>
        </button>
        {onUndo ? (
          <button
            type="button"
            className="pad-btn pad-undo"
            aria-label="Undo last"
            onPointerDown={tap(onUndo)}
          >
            <span>Undo</span>
          </button>
        ) : null}
        <button
          type="button"
          key={slam}
          className={`pad-btn pad-hard${slam ? " is-slam" : ""}${dropAsk ? " is-ask" : ""}`}
          aria-label="Hard drop"
          data-qa="pad-hard"
          onPointerDown={tap(onHard)}
        >
          <Icon d={ICO.drop} label="Hard drop" />
          <span>Drop</span>
        </button>
      </div>
    </div>
  );
}
