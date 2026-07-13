// MUD KINGS — audio.js : procedural WebAudio (no assets)
'use strict';

const SND = {
  ctx: null, master: null, muted: false,
  engines: [],       // per human player engine voices
  crowdGain: null,
};

SND.init = () => {
  if (SND.ctx) return;
  try {
    SND.ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return; }
  SND.master = SND.ctx.createGain();
  SND.master.gain.value = 0.32;
  SND.master.connect(SND.ctx.destination);
  SND._mkCrowd();
};

SND.unlock = () => {
  SND.init();
  if (SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
};

SND.toggleMute = () => {
  SND.muted = !SND.muted;
  if (SND.master) SND.master.gain.value = SND.muted ? 0 : 0.32;
  return SND.muted;
};

const _now = () => SND.ctx ? SND.ctx.currentTime : 0;

SND.beep = (freq, dur = 0.1, type = 'square', vol = 0.5, slide = 0) => {
  if (!SND.ctx || SND.muted) return;
  const t = _now();
  const o = SND.ctx.createOscillator(), gn = SND.ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  gn.gain.setValueAtTime(vol, t);
  gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(gn); gn.connect(SND.master);
  o.start(t); o.stop(t + dur + 0.02);
};

SND._noiseBuf = null;
SND.noise = (dur = 0.2, freq = 1200, vol = 0.4, q = 1) => {
  if (!SND.ctx || SND.muted) return;
  if (!SND._noiseBuf) {
    const n = SND.ctx.sampleRate * 1;
    SND._noiseBuf = SND.ctx.createBuffer(1, n, SND.ctx.sampleRate);
    const d = SND._noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = _now();
  const src = SND.ctx.createBufferSource();
  src.buffer = SND._noiseBuf; src.loop = true;
  const f = SND.ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const gn = SND.ctx.createGain();
  gn.gain.setValueAtTime(vol, t);
  gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(gn); gn.connect(SND.master);
  src.start(t); src.stop(t + dur + 0.02);
};

// ---- game events ----
SND.countBeep = () => SND.beep(440, 0.14, 'square', 0.4);
SND.goBeep = () => SND.beep(880, 0.4, 'square', 0.45);
SND.nitro = () => { SND.noise(0.7, 2400, 0.4, 0.7); SND.beep(180, 0.6, 'sawtooth', 0.25, 320); };
SND.pickupMoney = () => { SND.beep(988, 0.07, 'square', 0.35); setTimeout(() => SND.beep(1319, 0.12, 'square', 0.35), 70); };
SND.pickupNitro = () => { SND.beep(660, 0.06, 'square', 0.3); setTimeout(() => SND.beep(990, 0.1, 'square', 0.3), 60); };
SND.thud = () => { SND.beep(90, 0.12, 'triangle', 0.5, -40); SND.noise(0.08, 300, 0.3, 0.8); };
SND.crash = () => { SND.beep(70, 0.2, 'sawtooth', 0.45, -30); SND.noise(0.18, 700, 0.4, 0.8); };
SND.splash = () => SND.noise(0.35, 900, 0.45, 0.9);
SND.mudSquelch = () => SND.noise(0.25, 350, 0.35, 1.5);
SND.land = () => { SND.beep(110, 0.09, 'triangle', 0.4, -50); SND.noise(0.09, 500, 0.25, 1); };
SND.skid = () => SND.noise(0.12, 1800, 0.15, 2);
SND.buy = () => { SND.beep(1047, 0.08, 'square', 0.35); setTimeout(() => SND.beep(1568, 0.15, 'square', 0.35), 80); };
SND.deny = () => SND.beep(160, 0.2, 'square', 0.35);
SND.cursor = () => SND.beep(520, 0.05, 'square', 0.2);
SND.rescue = () => { SND.beep(330, 0.3, 'triangle', 0.3, 220); };

SND.fanfare = (big = false) => {
  const seq = big ? [523, 659, 784, 1047, 784, 1047] : [523, 659, 784];
  seq.forEach((f, i) => setTimeout(() => SND.beep(f, i === seq.length - 1 ? 0.45 : 0.16, 'square', 0.35), i * 150));
};

// ---- engine voices (one per human player) ----
SND.startEngine = (slot) => {
  if (!SND.ctx || SND.engines[slot]) return;
  const o = SND.ctx.createOscillator();
  o.type = 'sawtooth'; o.frequency.value = 55;
  const f = SND.ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 900;
  const gn = SND.ctx.createGain(); gn.gain.value = 0;
  const lfo = SND.ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 30;
  const lg = SND.ctx.createGain(); lg.gain.value = 6;
  lfo.connect(lg); lg.connect(o.frequency);
  o.connect(f); f.connect(gn); gn.connect(SND.master);
  o.start(); lfo.start();
  SND.engines[slot] = { o, gn, f };
};

SND.engineUpdate = (slot, speedNorm, boosting) => {
  const e = SND.engines[slot];
  if (!e) return;
  const t = _now();
  const target = 50 + speedNorm * 110 + (boosting ? 45 : 0);
  e.o.frequency.setTargetAtTime(target, t, 0.06);
  e.gn.gain.setTargetAtTime(0.10 + speedNorm * 0.06, t, 0.1);
};

SND.stopEngines = () => {
  for (const e of SND.engines) {
    if (!e) continue;
    e.gn.gain.setTargetAtTime(0, _now(), 0.08);
    setTimeout(() => { try { e.o.stop(); } catch (x) {} }, 400);
  }
  SND.engines = [];
};

// ---- crowd ----
SND._mkCrowd = () => {
  if (!SND.ctx) return;
  const n = SND.ctx.sampleRate * 2;
  const buf = SND.ctx.createBuffer(1, n, SND.ctx.sampleRate);
  const d = buf.getChannelData(0);
  let v = 0;
  for (let i = 0; i < n; i++) { v = v * 0.98 + (Math.random() * 2 - 1) * 0.02; d[i] = v * 8; }
  const src = SND.ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const f = SND.ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.4;
  SND.crowdGain = SND.ctx.createGain();
  SND.crowdGain.gain.value = 0;
  src.connect(f); f.connect(SND.crowdGain); SND.crowdGain.connect(SND.master);
  src.start();
};

SND.crowd = (level) => { // 0..1
  if (SND.crowdGain) SND.crowdGain.gain.setTargetAtTime(level * 0.35, _now(), 0.4);
};

SND.crowdSwell = () => {
  if (!SND.crowdGain) return;
  const t = _now();
  SND.crowdGain.gain.cancelScheduledValues(t);
  SND.crowdGain.gain.setTargetAtTime(0.5, t, 0.05);
  SND.crowdGain.gain.setTargetAtTime(0.18, t + 0.5, 0.6);
};
