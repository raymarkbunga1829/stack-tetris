import { useEffect, useRef, useState } from "react";
import {
  resumeAudio,
  setMuted,
  sfxClear,
  sfxHold,
  sfxLock,
  sfxMove,
  sfxOver,
  sfxRotate,
  sfxSelect,
  sfxStart,
  sfxTetris,
  unlockAudio,
} from "@/game/audio";
import { haptic, setHaptic } from "@/game/haptics";
import { createGestures, type GestureEmit, type GestureLabel } from "@/game/gestures";
import { createInput, type InputApi } from "@/game/input";
import { applyMissions, type MissionBook } from "@/game/missions";
import {
  dailySeed,
  formatClock,
  modeOf,
  utcDateKey,
  type ModeId,
} from "@/game/modes";
import { REPLAY_STEP, type Snap } from "@/game/replay";
import { resizeCanvas } from "@/game/render";
import { createViz } from "@/game/viz";
import { createWell3d, type Well3d } from "@/game/well3d";
import { loadSave, recordRun, writeSave, type HapticProfile, type SaveData } from "@/game/save";
import { buyTheme, themeOf, type ThemeId } from "@/game/themes";
import {
  advance,
  applyPower,
  createSim,
  dragPiece,
  pauseToggle,
  pickFromNext,
  type Sim,
} from "@/game/sim";
import { HIDDEN_ROWS, type Phase, type PieceId } from "@/game/types";
import {
  buyWithCredits,
  consumePower,
  purchaseSku,
  type Inventory,
  type PowerId,
  type Sku,
} from "@/game/shop";
import { CoachCard, nextCoach, type CoachStep } from "./coach-card";
import { MiniPiece } from "./mini-piece";
import { MissionRow } from "./mission-row";
import { ModeStrip } from "./mode-strip";
import { PowerBar } from "./power-bar";
import { SettingsSheet } from "./settings-sheet";
import { ShopSheet } from "./shop-sheet";
import { BoardSheet } from "./board-sheet";
import { TouchPad } from "./touch-pad";

type Ui = {
  phase: Phase;
  score: number;
  high: number;
  lines: number;
  level: number;
  hold: PieceId | null;
  next: PieceId[];
  banner: string | null;
  gesture: string | null;
  muted: boolean;
  drag: boolean;
  standalone: boolean;
  credits: number;
  inv: Inventory;
  shop: boolean;
  settings: boolean;
  board: boolean;
  slow: boolean;
  shield: boolean;
  mode: ModeId;
  clock: number;
  timeLeft: number | null;
  won: boolean;
  coach: CoachStep | null;
  theme: ThemeId;
  haptic: HapticProfile;
  hardConfirm: boolean;
  missions: MissionBook;
  picking: boolean;
};

function forceCoach() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("coach");
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
  );
}

export function TetrisApp() {
  const well3dRef = useRef<Well3d | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizCanvasRef = useRef<HTMLCanvasElement>(null);
  const wellRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Sim | null>(null);
  const inputRef = useRef<InputApi | null>(null);
  const vizRef = useRef(createViz());
  const saveRef = useRef<SaveData>(loadSave());
  const rafRef = useRef(0);
  const lastTs = useRef(0);
  const shakeRef = useRef(0);
  const bannerT = useRef(0);
  const bannerKind = useRef<"plain" | "mid" | "big">("plain");
  const swipeRef = useRef<ReturnType<typeof createGestures> | null>(null);
  const applyGestureRef = useRef<(ev: GestureEmit) => void>(() => {});
  const lastGestureRef = useRef<GestureLabel | null>(null);
  const gestureT = useRef(0);
  const grabRef = useRef<number | null>(null);
  const hardArm = useRef(0);
  const replayRef = useRef<Snap[] | null>(null);
  const replayI = useRef(0);
  const replayT = useRef(0);

  const [ui, setUi] = useState<Ui>({
    phase: "title",
    score: 0,
    high: saveRef.current.high,
    lines: 0,
    level: 1,
    hold: null,
    next: [],
    banner: null,
    gesture: null,
    muted: saveRef.current.muted,
    drag: saveRef.current.drag,
    standalone: false,
    credits: saveRef.current.credits,
    inv: saveRef.current.inv,
    shop: false,
    settings: false,
    board: false,
    slow: false,
    shield: false,
    mode: saveRef.current.mode,
    clock: 0,
    timeLeft: null,
    won: false,
    coach: saveRef.current.onboarded ? null : "drag",
    theme: saveRef.current.theme,
    haptic: saveRef.current.haptic,
    hardConfirm: saveRef.current.hardConfirm,
    missions: saveRef.current.missions,
    picking: false,
  });
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    setMuted(saveRef.current.muted);
    setHaptic(saveRef.current.haptic);
    setUi((p) => ({
      ...p,
      muted: saveRef.current.muted,
      high: saveRef.current.high,
      drag: saveRef.current.drag,
      theme: saveRef.current.theme,
      haptic: saveRef.current.haptic,
      hardConfirm: saveRef.current.hardConfirm,
      missions: saveRef.current.missions,
      mode: saveRef.current.mode,
      standalone: isStandalone(),
    }));
    const mq = window.matchMedia("(display-mode: standalone)");
    const onMode = () => setUi((p) => ({ ...p, standalone: isStandalone() }));
    mq.addEventListener("change", onMode);
    return () => mq.removeEventListener("change", onMode);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const vizCanvas = vizCanvasRef.current;
    const well = wellRef.current;
    if (!canvas || !well) return;

    const input = createInput();
    inputRef.current = input;
    const gestures = createGestures((ev) => applyGestureRef.current(ev));
    swipeRef.current = gestures;

    const engine = createWell3d(canvas);
    well3dRef.current = engine;

    const onVis = () => {
      if (!document.hidden) resumeAudio();
      else if (simRef.current?.phase === "playing") {
        simRef.current.phase = "paused";
        syncUi();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    const ro = new ResizeObserver(() => {
      engine.resize();
      if (vizCanvas) resizeCanvas(vizCanvas);
    });
    ro.observe(well);
    engine.resize();
    if (vizCanvas) resizeCanvas(vizCanvas);

    if (import.meta.env.DEV || new URLSearchParams(location.search).has("qa")) {
      window.__controlsTest = {
        getX: () => simRef.current?.piece?.x ?? 0,
        getY: () => simRef.current?.piece?.y ?? 0,
        getRot: () => simRef.current?.piece?.rot ?? 0,
        getPhase: () => uiRef.current.phase,
        getScore: () => simRef.current?.score ?? 0,
        getPiece: () => simRef.current?.piece?.id ?? null,
        setKeys: (codes) => input.setKeys(codes),
        tapLeft: () => input.tap({ left: true }),
        tapRight: () => input.tap({ right: true }),
        getGesture: () => lastGestureRef.current,
        feedGesture: (type, id, x, y, t) => gestures.feed(type, id, x, y, t),
        vizAlive: () => vizRef.current.liveCount(),
        getCredits: () => saveRef.current.credits,
        getZap: () => saveRef.current.inv.zap,
      };
    }

    lastTs.current = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs.current) / 1000);
      lastTs.current = now;
      tick(dt);
      paint();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      input.dispose();
      gestures.reset();
      swipeRef.current = null;
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      engine.dispose();
      well3dRef.current = null;
      delete window.__controlsTest;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncUi(extra: Partial<Ui> = {}) {
    const sim = simRef.current;
    setUi((prev) => ({
      ...prev,
      phase: extra.phase ?? sim?.phase ?? prev.phase,
      score: sim?.score ?? prev.score,
      lines: sim?.lines ?? prev.lines,
      level: sim?.level ?? prev.level,
      hold: sim?.hold ?? prev.hold,
      next: sim?.next ?? prev.next,
      high: saveRef.current.high,
      ...extra,
    }));
  }

  function startGame(nextMode?: ModeId) {
    const mode = nextMode ?? saveRef.current.mode;
    saveRef.current = { ...saveRef.current, mode };
    writeSave(saveRef.current);
    const seed = mode === "daily" ? dailySeed() : undefined;
    const sim = createSim({ mode, seed });
    simRef.current = sim;
    shakeRef.current = 0;
    replayRef.current = null;
    hardArm.current = 0;
    sfxStart();
    haptic("select");
    syncUi({
      phase: "playing",
      banner: null,
      score: 0,
      lines: 0,
      level: 1,
      hold: null,
      next: sim.next,
      mode,
      clock: 0,
      timeLeft: sim.timeLeft,
      won: false,
      coach: forceCoach() || !saveRef.current.onboarded ? "drag" : null,
      picking: false,
    });
  }

  function tick(dt: number) {
    const input = inputRef.current;
    if (!input) return;
    const { held, just } = input.sample();
    const u = uiRef.current;

    if (just.confirm || (just.hard && (u.phase === "title" || u.phase === "over"))) {
      if (u.phase === "title" || u.phase === "over") {
        startGame();
        return;
      }
    }
    if (just.pause) {
      if (u.phase === "playing" || u.phase === "paused") {
        if (simRef.current) {
          pauseToggle(simRef.current);
          syncUi({ phase: simRef.current.phase });
        }
      }
    }

    const sim = simRef.current;
    if (!sim || u.phase === "title") return;

    if (sim.phase === "paused" || sim.phase === "over") {
      if (shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - dt * 8);
      stepReplay(dt);
      return;
    }

    const ev = advance(sim, dt, {
      heldLeft: held.left,
      heldRight: held.right,
      justLeft: just.left,
      justRight: just.right,
      softDrop: held.down,
      justHard: just.hard,
      justCw: just.cw,
      justCcw: just.ccw,
      justHold: just.hold,
      nudge: input.takeNudge(),
    });

    if (shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - dt * 10);
    if (bannerT.current > 0) {
      bannerT.current -= dt;
      if (bannerT.current <= 0) syncUi({ banner: null });
    }
    if (gestureT.current > 0) {
      gestureT.current -= dt;
      if (gestureT.current <= 0) syncUi({ gesture: null });
    }

    if (ev === "move" && (just.left || just.right)) {
      sfxMove();
      haptic("move");
    }
    if (ev === "rotate") {
      sfxRotate();
      haptic("rotate");
    }
    if (ev === "hold") {
      sfxHold();
      haptic("select");
      payMissions({ hold: 1 });
      syncUi();
    }
    if (ev === "lock") {
      sfxLock();
      haptic("lock");
      if (sim.phase === "clearing" && sim.clearRows.length) {
        juiceClear(
          sim.clearRows.length === 4 ? "stack" : sim.tSpin ? "tspin" : "clear",
        );
      }
      syncUi();
    }
    if (ev === "clear") {
      sfxClear();
      haptic("clear");
      shakeRef.current = 5;
      flashBanner(sim.lastClear ?? "CLEAR");
      syncUi();
    }
    if (ev === "tetris" || ev === "tspin") {
      sfxTetris();
      haptic("tetris");
      shakeRef.current = ev === "tetris" ? 12 : 8;
      well3dRef.current?.punch(ev === "tetris" ? 0.35 : 0.25);
      flashBanner(sim.lastClear ?? "STACK");
      if (ev === "tetris") payMissions({ tetris: 1 });
      syncUi();
    }
    if (ev === "win" || ev === "over") {
      if (ev === "win") {
        sfxTetris();
        haptic("win");
        flashBanner(sim.won && sim.mode === "sprint" ? "CLEAR" : "TIME");
      } else {
        sfxOver();
        haptic("over");
      }
      finishRun(sim);
    }

    if (sim.pendingCoins) {
      saveRef.current = {
        ...saveRef.current,
        credits: saveRef.current.credits + sim.pendingCoins,
      };
      writeSave(saveRef.current);
      sim.pendingCoins = 0;
      syncUi({ credits: saveRef.current.credits });
    }

    if (sim.score !== u.score || sim.level !== u.level || sim.lines !== u.lines) {
      if (sim.lines > u.lines) payMissions({ lines: sim.lines - u.lines, level: sim.level });
      else payMissions({ level: sim.level });
      syncUi({
        slow: sim.slowT > 0,
        shield: sim.shield,
        clock: sim.clock,
        timeLeft: sim.timeLeft,
      });
    } else if (
      u.slow !== sim.slowT > 0 ||
      u.shield !== sim.shield ||
      Math.floor(u.clock) !== Math.floor(sim.clock)
    ) {
      syncUi({
        slow: sim.slowT > 0,
        shield: sim.shield,
        clock: sim.clock,
        timeLeft: sim.timeLeft,
      });
    }
  }

  function payMissions(ev: Parameters<typeof applyMissions>[1]) {
    const { book, payout, done } = applyMissions(saveRef.current.missions, ev);
    const changed =
      payout > 0 ||
      done.length > 0 ||
      book.items.some((m, i) => m.progress !== saveRef.current.missions.items[i]?.progress);
    if (!changed) return;
    saveRef.current = {
      ...saveRef.current,
      missions: book,
      credits: saveRef.current.credits + payout,
    };
    writeSave(saveRef.current);
    if (done[0]) flashBanner(`+${payout} CR`);
    syncUi({ missions: book, credits: saveRef.current.credits });
  }

  function finishRun(sim: Sim) {
    saveRef.current = recordRun(saveRef.current, {
      mode: sim.mode,
      score: sim.score,
      lines: sim.lines,
      clock: sim.clock,
      won: sim.won,
      t: Date.now(),
    });
    if (sim.won && sim.mode === "sprint") payMissions({ modeWin: "sprint" });
    if (sim.history.length > 1) {
      replayRef.current = sim.history.slice();
      replayI.current = 0;
      replayT.current = 0;
    }
    syncUi({
      phase: "over",
      high: saveRef.current.high,
      won: sim.won,
      clock: sim.clock,
    });
  }

  function stepReplay(dt: number) {
    const snaps = replayRef.current;
    if (!snaps || snaps.length === 0) return;
    replayT.current += dt;
    if (replayT.current < REPLAY_STEP) return;
    replayT.current = 0;
    replayI.current = (replayI.current + 1) % snaps.length;
  }

  function juiceClear(kind: "clear" | "stack" | "tspin") {
    const engine = well3dRef.current;
    const sim = simRef.current;
    if (!engine || !sim) return;
    engine.punch(kind === "stack" ? 0.95 : kind === "tspin" ? 0.78 : 0.42);
    const tint =
      kind === "stack"
        ? "#f4f1ea"
        : kind === "tspin"
          ? "#c9d6ea"
          : "#d8dde6";
    engine.sparkRows(sim.clearRows, tint);
  }

  function flashBanner(text: string) {
    const big = text.startsWith("STACK") || text.startsWith("T-SPIN");
    const mid = text === "TRIPLE" || text === "DOUBLE";
    bannerKind.current = big ? "big" : mid ? "mid" : "plain";
    bannerT.current = big ? 1.35 : mid ? 1.05 : 0.8;
    syncUi({ banner: text });
  }

  function paint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const theme = themeOf(saveRef.current.theme);
    const snaps = replayRef.current;
    let view = simRef.current;
    if (view && snaps && view.phase === "over" && snaps[replayI.current]) {
      const s = snaps[replayI.current]!;
      view = { ...view, board: s.board, piece: s.piece, score: s.score, lines: s.lines };
    }
    well3dRef.current?.draw(view, reduce ? 0 : shakeRef.current, theme);
    const vizCanvas = vizCanvasRef.current;
    const well = wellRef.current;
    if (vizCanvas && well) {
      vizRef.current.draw(
        vizCanvas,
        swipeRef.current?.snapshot() ?? [],
        well.getBoundingClientRect(),
        performance.now(),
        reduce,
      );
    }
  }

  function toggleMute() {
    unlockAudio();
    const next = !uiRef.current.muted;
    setMuted(next);
    saveRef.current = { ...saveRef.current, muted: next };
    writeSave(saveRef.current);
    syncUi({ muted: next });
  }

  function openShop() {
    unlockAudio();
    if (simRef.current?.phase === "playing") {
      simRef.current.phase = "paused";
      syncUi({ phase: "paused", shop: true });
    } else {
      syncUi({ shop: true });
    }
  }

  function closeShop() {
    syncUi({ shop: false });
  }

  function usePower(id: PowerId) {
    unlockAudio();
    const sim = simRef.current;
    if (!sim || (sim.phase !== "playing" && sim.phase !== "clearing")) return;
    if (id === "pick") {
      if (uiRef.current.picking) {
        syncUi({ picking: false });
        return;
      }
      if ((saveRef.current.inv.pick ?? 0) < 1) return;
      flashBanner("Tap Next");
      syncUi({ picking: true });
      return;
    }
    const next = consumePower(saveRef.current, id);
    if (!next) return;
    if (!applyPower(sim, id)) return;
    saveRef.current = next;
    writeSave(next);
    flashBanner(sim.lastClear ?? id.toUpperCase());
    syncUi({
      inv: next.inv,
      credits: next.credits,
      slow: sim.slowT > 0,
      shield: sim.shield,
    });
  }

  function chooseNext(index: number) {
    unlockAudio();
    const sim = simRef.current;
    if (!sim || !uiRef.current.picking) return;
    if (!pickFromNext(sim, index)) return;
    const next = consumePower(saveRef.current, "pick");
    if (!next) {
      syncUi({ picking: false });
      return;
    }
    saveRef.current = next;
    writeSave(next);
    flashBanner("PICK");
    haptic("select");
    syncUi({
      picking: false,
      inv: next.inv,
      next: sim.next,
      hold: sim.hold,
    });
  }

  async function onBuySku(sku: Sku) {
    unlockAudio();
    setBuying(sku.id);
    const next = await purchaseSku(saveRef.current, sku.id);
    setBuying(null);
    if (!next) return;
    let granted = next;
    if (sku.id === "theme_night" && !granted.themes.includes("night")) {
      granted = {
        ...granted,
        themes: [...granted.themes, "night"],
        theme: "night",
      };
    }
    saveRef.current = granted;
    writeSave(granted);
    syncUi({ credits: granted.credits, inv: granted.inv, theme: granted.theme });
  }

  function onBuyPower(id: PowerId) {
    unlockAudio();
    const next = buyWithCredits(saveRef.current, id);
    if (!next) return;
    saveRef.current = next;
    writeSave(next);
    syncUi({ credits: next.credits, inv: next.inv });
  }

  function showGesture(label: GestureLabel) {
    lastGestureRef.current = label;
    if (label === "soft" || label === "drag") return;
    gestureT.current = 0.7;
    syncUi({ gesture: label });
  }

  function applyGesture(ev: GestureEmit) {
    const input = inputRef.current;
    if (!input) return;
    if (uiRef.current.shop || uiRef.current.settings || uiRef.current.board) return;
    const phase = uiRef.current.phase;
    const { action, label } = ev;
    if (action.name !== "drag") grabRef.current = null;
    showGesture(label);
    advanceCoach(label);

    if (action.name === "hard" && !wantHard()) return;
    const pt = swipeRef.current?.lastPoint();
    if (pt && label !== "soft" && label !== "swipe" && label !== "drag") {
      const live = swipeRef.current?.snapshot()[0];
      vizRef.current.burst({
        label,
        x: pt.x,
        y: pt.y,
        dx: live ? live.x - live.sx : 0,
        dy: live
          ? live.y - live.sy
          : label === "flick"
            ? 1
            : label === "hold" || label === "long-press"
              ? -1
              : 0,
      });
    }

    if (phase === "title" || phase === "over") {
      if (action.name === "confirm" || action.name === "hard") startGame();
      return;
    }
    if (phase === "paused") {
      if (action.name === "confirm" && simRef.current) {
        simRef.current.phase = "playing";
        syncUi({ phase: "playing" });
      }
      return;
    }
    if (phase !== "playing" && phase !== "clearing") return;

    if (action.name === "drag") {
      const well = wellRef.current;
      const sim = simRef.current;
      if (!well || !sim?.piece) return;
      const engine3 = well3dRef.current;
      if (!well || !sim?.piece || !engine3) return;
      const hit = engine3.clientToCell(
        well.getBoundingClientRect(),
        action.x,
        action.y,
      );
      if (grabRef.current == null) grabRef.current = sim.piece.x - hit.col;
      dragPiece(sim, hit.col + grabRef.current, sim.piece.y);
      return;
    }
    if (action.name === "soft") return;
    else if (action.name === "hard") input.tap({ hard: true });
    else if (action.name === "rotate") {
      input.tap(action.dir === 1 ? { cw: true } : { ccw: true });
    } else if (action.name === "hold") {
      input.tap({ hold: true });
    }
  }
  applyGestureRef.current = applyGesture;
  function wantHard(): boolean {
    if (!uiRef.current.hardConfirm) return true;
    const now = performance.now();
    if (now - hardArm.current < 480) {
      hardArm.current = 0;
      return true;
    }
    hardArm.current = now;
    flashBanner("Drop?");
    return false;
  }

  function finishCoach() {
    saveRef.current = { ...saveRef.current, onboarded: true };
    writeSave(saveRef.current);
    syncUi({ coach: null });
    flashBanner("Ready");
  }

  function advanceCoach(label: GestureLabel | "left" | "right" | "cw" | "ccw" | "hard") {
    const step = uiRef.current.coach;
    if (!step) return;
    const next = nextCoach(step, label);
    if (next === "done") finishCoach();
    else if (next !== step) syncUi({ coach: next });
  }

  function pickMode(id: ModeId) {
    unlockAudio();
    saveRef.current = { ...saveRef.current, mode: id };
    writeSave(saveRef.current);
    syncUi({ mode: id });
  }

  function openSettings() {
    unlockAudio();
    if (simRef.current?.phase === "playing") {
      simRef.current.phase = "paused";
      syncUi({ phase: "paused", settings: true });
    } else syncUi({ settings: true });
  }

  function openBoard() {
    unlockAudio();
    if (simRef.current?.phase === "playing") {
      simRef.current.phase = "paused";
      syncUi({ phase: "paused", board: true });
    } else syncUi({ board: true });
  }

  function setProfile(p: HapticProfile) {
    setHaptic(p);
    saveRef.current = { ...saveRef.current, haptic: p };
    writeSave(saveRef.current);
    haptic("select");
    syncUi({ haptic: p });
  }

  function toggleHard() {
    const next = !saveRef.current.hardConfirm;
    saveRef.current = { ...saveRef.current, hardConfirm: next };
    writeSave(saveRef.current);
    syncUi({ hardConfirm: next });
  }

  function onTheme(id: ThemeId) {
    const next = buyTheme(saveRef.current, id);
    if (!next) return;
    saveRef.current = next;
    writeSave(next);
    syncUi({ theme: next.theme, credits: next.credits });
  }

  function onWellPointer(e: React.PointerEvent<HTMLDivElement>) {
    unlockAudio();
    if (e.type === "pointerdown") {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    const kind =
      e.type === "pointerdown"
        ? "down"
        : e.type === "pointermove"
          ? "move"
          : e.type === "pointercancel"
            ? "cancel"
            : "up";
    swipeRef.current?.feed(
      kind,
      e.pointerId,
      e.clientX,
      e.clientY,
      e.timeStamp || performance.now(),
    );
  }

  return (
    <main className="shell">
      <div
        className={`cabinet${ui.phase === "playing" || ui.phase === "clearing" ? " is-play" : ""}${ui.picking ? " is-pick" : ""}`}
      >
        <header className="topbar">
          <h1 className="logo">Stack</h1>
          <button type="button" className="cr-pill" onClick={openShop} data-qa="open-shop">
            {ui.credits.toLocaleString()} CR
          </button>
          <p className="hi">Best {ui.high.toLocaleString()}</p>
        </header>

        <div className="stats">
          <Stat label="Score" value={ui.score.toLocaleString()} />
          <Stat
            label={ui.mode === "blitz" ? "Time" : "Level"}
            value={
              ui.mode === "blitz"
                ? formatClock(ui.timeLeft ?? 0)
                : String(ui.level)
            }
          />
          <Stat
            label="Lines"
            value={
              ui.mode === "sprint"
                ? `${ui.lines}/40`
                : String(ui.lines)
            }
          />
        </div>

        <div className="stage">
          <aside className="rail">
            <p className="rail-label">Hold</p>
            <div
              className="pocket pocket-hold"
              role="button"
              tabIndex={0}
              aria-label="Hold piece"
              onPointerDown={(e) => {
                e.preventDefault();
                unlockAudio();
                inputRef.current?.tap({ hold: true });
                advanceCoach("hold");
              }}
            >
              <MiniPiece id={ui.hold} theme={ui.theme} />
            </div>
          </aside>

          <div
            ref={wellRef}
            className="well"
            onPointerDown={onWellPointer}
            onPointerMove={onWellPointer}
            onPointerUp={onWellPointer}
            onPointerCancel={onWellPointer}
          >
            <canvas ref={canvasRef} />
            <canvas ref={vizCanvasRef} className="viz" aria-hidden="true" />
            {ui.phase === "title" && (
              <div className="veil">
                <p className="veil-kicker">{modeOf(ui.mode).blurb}</p>
                <p className="veil-title">Stack</p>
                <p className="veil-hint">Tap to play</p>
              </div>
            )}
            {ui.phase === "paused" && (
              <div className="veil">
                <p className="veil-title">Paused</p>
                <p className="veil-hint">Tap to resume</p>
              </div>
            )}
            {ui.phase === "over" && (
              <div className="veil">
                <p className="veil-kicker">
                  {ui.won
                    ? ui.mode === "sprint"
                      ? formatClock(ui.clock)
                      : "Time"
                    : ui.score >= ui.high && ui.score > 0
                      ? "New best"
                      : "Game over"}
                </p>
                <p className="veil-title">{ui.score.toLocaleString()}</p>
                <p className="veil-hint">
                  {replayRef.current ? "Replay · tap retry" : "Tap to retry"}
                </p>
              </div>
            )}
            {ui.phase === "playing" && (
              <button
                type="button"
                className="well-pause"
                aria-label="Pause"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  unlockAudio();
                  if (simRef.current) {
                    pauseToggle(simRef.current);
                    syncUi({ phase: simRef.current.phase });
                  }
                }}
              >
                Pause
              </button>
            )}
            {ui.coach && ui.phase === "playing" && (
              <CoachCard step={ui.coach} onSkip={finishCoach} />
            )}
            {ui.banner && ui.phase === "playing" && (
              <p className={`banner is-${bannerKind.current}`}>{ui.banner}</p>
            )}
            {ui.gesture && ui.phase === "playing" && (
              <p className="gchip">{ui.gesture}</p>
            )}
          </div>

          <aside className="rail">
            <p className="rail-label">Next</p>
            <div className="next-list">
              {(ui.next.length ? ui.next : [null, null, null, null, null])
                .slice(0, 5)
                .map((id, i) => (
                  <button
                    type="button"
                    className={`pocket pocket-sm${ui.picking ? " is-pickable" : ""}`}
                    key={i}
                    disabled={!ui.picking || !id}
                    aria-label={ui.picking ? `Use ${id ?? "piece"}` : undefined}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (ui.picking) chooseNext(i);
                    }}
                  >
                    <MiniPiece id={id} theme={ui.theme} />
                  </button>
                ))}
            </div>
          </aside>
        </div>

        <PowerBar
          inv={ui.inv}
          shieldOn={ui.shield}
          slowOn={ui.slow}
          onUse={usePower}
          pickOn={ui.picking}
        />

        <TouchPad
          onHold={(key, down) => {
            unlockAudio();
            inputRef.current?.setTouch({ [key]: down });
            if (down && (key === "left" || key === "right")) {
              inputRef.current?.tap({ [key]: true });
              advanceCoach(key);
            }
          }}
          onCw={() => {
            unlockAudio();
            inputRef.current?.tap({ cw: true });
            advanceCoach("cw");
          }}
          onCcw={() => {
            unlockAudio();
            inputRef.current?.tap({ ccw: true });
            advanceCoach("ccw");
          }}
          onHard={() => {
            unlockAudio();
            if (ui.phase === "title" || ui.phase === "over") startGame();
            else if (wantHard()) {
              inputRef.current?.tap({ hard: true });
              advanceCoach("hard");
            }
          }}
          onHoldPiece={() => {
            unlockAudio();
            inputRef.current?.tap({ hold: true });
            advanceCoach("hold");
          }}
        />

        {(ui.phase === "title" || ui.phase === "over" || ui.phase === "paused") && (
          <ModeStrip mode={ui.mode} onPick={pickMode} />
        )}
        {ui.phase === "title" && <MissionRow book={ui.missions} />}

        <footer className="foot">
          <button type="button" className="text-btn" onClick={openShop}>
            Store
          </button>
          <button type="button" className="text-btn" onClick={openSettings}>
            Settings
          </button>
          <button type="button" className="text-btn" onClick={openBoard}>
            Scores
          </button>
          <button type="button" className="text-btn" onClick={toggleMute}>
            {ui.muted ? "Sound off" : "Sound on"}
          </button>
          {ui.phase === "playing" && (
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                unlockAudio();
                if (simRef.current) {
                  pauseToggle(simRef.current);
                  syncUi({ phase: simRef.current.phase });
                }
              }}
            >
              Pause
            </button>
          )}
          {!ui.standalone && ui.phase !== "playing" && ui.phase !== "clearing" && (
            <a className="text-btn install" href="?install=1&platform=ios">
              Add to iPhone
            </a>
          )}
        </footer>
        <p className="help help-keys">
          A D move · W / Up rotate · S soft · Space hard · C hold
        </p>
        <p className="help help-touch">
          Drag left or right · tap to rotate · Hold parks a piece · Drop slams it
        </p>
        <ShopSheet
          open={ui.shop}
          credits={ui.credits}
          buying={buying}
          onClose={closeShop}
          onBuyCredits={onBuySku}
          onBuyPower={onBuyPower}
        />
        <SettingsSheet
          open={ui.settings}
          haptic={ui.haptic}
          hardConfirm={ui.hardConfirm}
          theme={ui.theme}
          themes={saveRef.current.themes}
          credits={ui.credits}
          onClose={() => syncUi({ settings: false })}
          onHaptic={setProfile}
          onHard={toggleHard}
          onTheme={onTheme}
        />
        <BoardSheet
          open={ui.board}
          scores={saveRef.current.scores}
          onClose={() => syncUi({ board: false })}
        />
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

declare global {
  interface Window {
    __controlsTest?: {
      getX: () => number;
      getY: () => number;
      getRot: () => number;
      getPhase: () => Phase;
      getScore: () => number;
      getPiece: () => PieceId | null;
      setKeys: (codes: string[]) => void;
      tapLeft: () => void;
      tapRight: () => void;
      getGesture: () => GestureLabel | null;
      feedGesture: (
        type: "down" | "move" | "up" | "cancel",
        id: number,
        x: number,
        y: number,
        t?: number,
      ) => void;
      vizAlive: () => number;
      getCredits: () => number;
      getZap: () => number;
    };
  }
}
