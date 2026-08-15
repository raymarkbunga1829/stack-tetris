type Bus = {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
  noise: AudioBuffer;
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

function makeNoise(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.45);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
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
    sfx.gain.value = 0.22;
    master.gain.value = muted ? 0 : 1;
    sfx.connect(master);
    master.connect(ctx.destination);
    bus = { ctx, master, sfx, noise: makeNoise(ctx) };
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

function slide(
  from: number,
  to: number,
  dur: number,
  when = 0,
  type: OscillatorType = "sawtooth",
  vol = 0.35,
) {
  if (!bus || muted) return;
  const { ctx, sfx } = bus;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(sfx);
  osc.start(t);
  osc.stop(t + dur + 0.04);
}

function noiseBurst(
  dur: number,
  when = 0,
  vol = 0.28,
  freq = 1400,
  q = 0.8,
) {
  if (!bus || muted) return;
  const { ctx, sfx, noise } = bus;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(freq, t);
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(sfx);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export function sfxMove() {
  tone(280, 0.025, 0, "square", 0.22);
}
export function sfxRotate() {
  tone(520, 0.04, 0, "square", 0.35);
}
export function sfxLock() {
  tone(140, 0.07, 0, "triangle", 0.5);
  tone(90, 0.09, 0.01, "sine", 0.35);
  noiseBurst(0.06, 0, 0.12, 280, 0.6);
}
export function sfxHold() {
  tone(400, 0.04, 0, "square", 0.3);
  tone(620, 0.05, 0.04, "square", 0.28);
}
export function sfxClear() {
  noiseBurst(0.12, 0, 0.32, 2200, 0.7);
  tone(660, 0.05, 0, "square", 0.4);
  tone(880, 0.08, 0.05, "square", 0.36);
}
export function sfxShatter() {
  noiseBurst(0.18, 0, 0.38, 1800, 0.55);
  noiseBurst(0.14, 0.03, 0.22, 3200, 1.1);
  slide(420, 140, 0.16, 0.02, "triangle", 0.22);
}
export function sfxSweep() {
  slide(240, 1400, 0.18, 0, "sawtooth", 0.22);
  slide(1400, 280, 0.2, 0.1, "sine", 0.18);
  noiseBurst(0.22, 0.04, 0.16, 900, 0.4);
}
export function sfxHard() {
  slide(520, 90, 0.12, 0, "sawtooth", 0.32);
  noiseBurst(0.1, 0, 0.24, 600, 0.5);
  tone(70, 0.1, 0.04, "sine", 0.4);
}
export function sfxTetris() {
  sfxSweep();
  tone(523, 0.07, 0.04);
  tone(659, 0.07, 0.11);
  tone(784, 0.08, 0.18);
  tone(1047, 0.16, 0.26);
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

export function sfxZap() {
  noiseBurst(0.08, 0, 0.4, 2800, 1.4);
  slide(1800, 220, 0.12, 0, "square", 0.38);
  tone(1400, 0.04, 0.02, "square", 0.3);
}

export function sfxQuake() {
  noiseBurst(0.28, 0, 0.42, 180, 0.45);
  tone(70, 0.22, 0, "sine", 0.55);
  tone(48, 0.28, 0.04, "triangle", 0.4);
  slide(200, 55, 0.2, 0.02, "sawtooth", 0.2);
}

export function sfxSlow() {
  slide(620, 220, 0.28, 0, "sine", 0.28);
  tone(330, 0.18, 0.06, "triangle", 0.22);
}

export function sfxShield() {
  tone(480, 0.08, 0, "sine", 0.32);
  tone(720, 0.12, 0.05, "triangle", 0.28);
  slide(360, 880, 0.16, 0.02, "sine", 0.18);
}

export function sfxPick() {
  tone(784, 0.05, 0, "square", 0.36);
  tone(988, 0.08, 0.05, "triangle", 0.32);
  noiseBurst(0.1, 0.02, 0.16, 2400, 0.8);
}

export function sfxPower(id: "zap" | "slow" | "shield" | "quake" | "pick") {
  if (id === "zap") sfxZap();
  else if (id === "slow") sfxSlow();
  else if (id === "shield") sfxShield();
  else if (id === "quake") sfxQuake();
  else sfxPick();
}
