type Bus = {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
};

let bus: Bus | null = null;
let muted = false;

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean) {
  muted = next;
  if (bus) {
    bus.master.gain.setTargetAtTime(muted ? 0 : 1, bus.ctx.currentTime, 0.02);
  }
}

export function unlockAudio() {
  if (!bus) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx({ latencyHint: "interactive" });
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    sfx.gain.value = 0.2;
    master.gain.value = muted ? 0 : 1;
    sfx.connect(master);
    master.connect(ctx.destination);
    bus = { ctx, master, sfx };
  }
  if (bus.ctx.state === "suspended") void bus.ctx.resume();
}

export function resumeAudio() {
  if (bus && bus.ctx.state === "suspended") void bus.ctx.resume();
}

function tone(
  freq: number,
  dur: number,
  when = 0,
  type: OscillatorType = "square",
  vol = 0.8,
) {
  if (!bus || muted) return;
  const { ctx, sfx } = bus;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(sfx);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

export function sfxMove() {
  tone(280, 0.025, 0, "square", 0.22);
}
export function sfxRotate() {
  tone(520, 0.04, 0, "square", 0.35);
}
export function sfxLock() {
  tone(180, 0.05, 0, "triangle", 0.4);
}
export function sfxHold() {
  tone(400, 0.04, 0, "square", 0.3);
  tone(620, 0.05, 0.04, "square", 0.28);
}
export function sfxClear() {
  tone(660, 0.05, 0, "square", 0.45);
  tone(880, 0.08, 0.05, "square", 0.4);
}
export function sfxTetris() {
  tone(523, 0.07, 0);
  tone(659, 0.07, 0.07);
  tone(784, 0.08, 0.14);
  tone(1047, 0.16, 0.22);
}
export function sfxOver() {
  tone(196, 0.12, 0, "square", 0.7);
  tone(147, 0.16, 0.12, "square", 0.65);
  tone(98, 0.28, 0.26, "square", 0.6);
}
export function sfxStart() {
  tone(392, 0.06, 0, "square", 0.4);
  tone(523, 0.08, 0.07, "square", 0.45);
}
export function sfxSelect() {
  tone(660, 0.04, 0, "square", 0.4);
}
