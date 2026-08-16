type Bus = {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  noise: AudioBuffer;
};

let bus: Bus | null = null;
let muted = false;
let musicVol = 1;
let sfxVol = 1;

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function applyGains() {
  if (!bus) return;
  const t = bus.ctx.currentTime;
  bus.sfx.gain.setTargetAtTime(0.22 * sfxVol, t, 0.03);
  const bed = 0.09 * musicVol;
  bus.music.gain.setTargetAtTime(musicPaused ? bed * 0.5 : bed, t, 0.05);
  bus.master.gain.setTargetAtTime(1, t, 0.02);
}

export function isMuted(): boolean {
  return musicVol <= 0 && sfxVol <= 0;
}

export function getMix() {
  return { music: musicVol, sfx: sfxVol };
}

export function setMix(next: { music?: number; sfx?: number }) {
  if (next.music != null) musicVol = clamp01(next.music);
  if (next.sfx != null) sfxVol = clamp01(next.sfx);
  muted = isMuted();
  applyGains();
  if (musicVol > 0 && musicMode && !musicRaf) {
    musicNext = bus ? bus.ctx.currentTime + 0.05 : 0;
    musicRaf = requestAnimationFrame(pumpMusic);
  }
}

export function setMuted(next: boolean) {
  setMix({ music: next ? 0 : 1, sfx: next ? 0 : 1 });
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
    const music = ctx.createGain();
    sfx.gain.value = 0.22 * sfxVol;
    music.gain.value = 0.09 * musicVol;
    master.gain.value = 1;
    sfx.connect(master);
    music.connect(master);
    master.connect(ctx.destination);
    bus = { ctx, master, sfx, music, noise: makeNoise(ctx) };
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
  if (!bus || sfxVol <= 0) return;
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
  if (!bus || sfxVol <= 0) return;
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
  if (!bus || sfxVol <= 0) return;
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
export function sfxLand(heavy = false) {
  if (heavy) {
    tone(86, 0.055, 0, "sine", 0.3);
    noiseBurst(0.045, 0, 0.09, 180, 0.32);
  } else {
    tone(168, 0.035, 0, "triangle", 0.2);
    noiseBurst(0.03, 0, 0.05, 360, 0.2);
  }
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

export function sfxCombo(n: number) {
  const step = Math.min(6, Math.max(1, n));
  tone(420 + step * 70, 0.07, 0, "triangle", 0.28);
  tone(620 + step * 80, 0.1, 0.04, "sine", 0.24);
}

export function sfxB2b() {
  tone(392, 0.07, 0, "square", 0.28);
  tone(523, 0.09, 0.05, "triangle", 0.3);
  tone(784, 0.14, 0.1, "sine", 0.26);
}

export function sfxPerfect() {
  tone(523, 0.1, 0, "triangle", 0.32);
  tone(659, 0.12, 0.05, "sine", 0.3);
  tone(784, 0.16, 0.1, "triangle", 0.28);
  tone(1046, 0.22, 0.16, "sine", 0.22);
  noiseBurst(0.14, 0.02, 0.18, 1800, 0.6);
}

export function sfxPower(id: "zap" | "slow" | "shield" | "quake" | "pick") {
  if (id === "zap") sfxZap();
  else if (id === "slow") sfxSlow();
  else if (id === "shield") sfxShield();
  else if (id === "quake") sfxQuake();
  else sfxPick();
}

const BEDS: Record<string, { bpm: number; notes: number[] }> = {
  marathon: { bpm: 92, notes: [196, 247, 294, 0, 330, 294, 247, 196] },
  sprint: { bpm: 118, notes: [262, 330, 392, 330, 349, 392, 0, 330] },
  blitz: { bpm: 148, notes: [330, 392, 494, 392, 523, 494, 392, 330] },
  daily: { bpm: 100, notes: [220, 262, 330, 262, 294, 330, 0, 220] },
  arcade: { bpm: 126, notes: [196, 247, 294, 247, 330, 294, 0, 247] },
  classic: { bpm: 88, notes: [196, 220, 247, 196, 262, 247, 0, 196] },
};

let musicMode: string | null = null;
let musicStep = 0;
let musicNext = 0;
let musicRaf = 0;
let musicPaused = false;
let musicTight = false;

export function setMusicTension(on: boolean) {
  musicTight = on;
}

function hum(freq: number, dur: number, when: number, vol = 0.22) {
  if (!bus || musicVol <= 0 || freq <= 0) return;
  const { ctx, music } = bus;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vol, when + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g);
  g.connect(music);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

function pumpMusic() {
  musicRaf = 0;
  if (!bus || !musicMode || musicVol <= 0) return;
  const spec = BEDS[musicMode] ?? BEDS.marathon!;
  const bpm = spec.bpm * (musicTight ? 1.32 : 1);
  const step = 60 / bpm / 2;
  const now = bus.ctx.currentTime;
  if (musicNext < now - 0.2) musicNext = now;
  while (musicNext < now + 0.35) {
    const note = spec.notes[musicStep % spec.notes.length] ?? 0;
    const lift = musicTight && note > 0 ? note * 1.122 : note;
    if (lift > 0) hum(lift, step * 1.6, musicNext, musicTight ? 0.22 : 0.18);
    if (musicStep % 8 === 0) hum(note > 0 ? note / 2 : 98, step * 3.2, musicNext, 0.1);
    musicNext += step;
    musicStep += 1;
  }
  musicRaf = requestAnimationFrame(pumpMusic);
}

export function startMusic(mode: string) {
  unlockAudio();
  musicMode = mode;
  musicStep = 0;
  musicPaused = false;
  musicNext = bus ? bus.ctx.currentTime + 0.05 : 0;
  if (!musicRaf) musicRaf = requestAnimationFrame(pumpMusic);
}

export function stopMusic() {
  musicMode = null;
  musicPaused = false;
  musicTight = false;
  if (musicRaf) cancelAnimationFrame(musicRaf);
  musicRaf = 0;
}

export function setMusicPaused(next: boolean) {
  musicPaused = next;
  applyGains();
  if (!next && musicMode && musicVol > 0 && !musicRaf) {
    musicNext = bus ? bus.ctx.currentTime + 0.05 : 0;
    musicRaf = requestAnimationFrame(pumpMusic);
  }
}
