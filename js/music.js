// MUD KINGS — music.js : procedural chiptune engine (no assets)
// Songs are 32-step loops (8th notes, 4 bars). Scheduled ahead of the
// AudioContext clock from the real-time frame loop (MUSIC.tick).
'use strict';

const MUSIC = {
  cur: null, pos: 0, next: 0, hot: false, scheduled: 0,
};

// note numbers are MIDI (69 = A4); 0 = rest
const SONGS = {
  // driving E-minor race loop, 150bpm
  race: {
    bpm: 150, len: 32,
    bass: [40, 40, 47, 40, 40, 40, 47, 43,
           40, 40, 47, 40, 40, 43, 45, 47,
           48, 48, 55, 48, 48, 48, 55, 52,
           50, 50, 57, 50, 50, 50, 45, 47],
    lead: [64, 0, 67, 69, 71, 0, 69, 67,
           64, 0, 67, 71, 69, 0, 0, 0,
           72, 0, 71, 69, 67, 0, 69, 71,
           74, 72, 71, 69, 67, 64, 0, 0],
    kick:  [1, 0, 0, 0, 1, 0, 0, 0], // repeats every 8
    snare: [0, 0, 1, 0, 0, 0, 1, 0],
    hat:   [1, 1, 1, 1, 1, 1, 1, 1],
  },
  // anthemic A-minor title loop, 112bpm
  title: {
    bpm: 112, len: 32,
    bass: [45, 45, 52, 45, 45, 45, 52, 48,
           41, 41, 48, 41, 41, 41, 48, 45,
           48, 48, 55, 48, 48, 48, 55, 52,
           43, 43, 50, 43, 43, 43, 50, 47],
    lead: [69, 0, 72, 74, 76, 0, 74, 72,
           69, 0, 72, 76, 74, 0, 72, 0,
           76, 0, 74, 72, 71, 0, 72, 74,
           71, 0, 67, 71, 69, 0, 0, 0],
    kick:  [1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 1, 0, 0, 0, 1, 0],
    hat:   [1, 0, 1, 0, 1, 0, 1, 0],
  },
  // laid-back bluesy shop loop, 96bpm
  shop: {
    bpm: 96, len: 32,
    bass: [48, 0, 48, 51, 52, 0, 48, 0,
           48, 0, 48, 51, 52, 0, 46, 0,
           53, 0, 53, 56, 57, 0, 53, 0,
           55, 0, 55, 53, 52, 0, 50, 0],
    lead: [0, 0, 72, 0, 76, 0, 75, 72,
           0, 0, 0, 0, 74, 0, 72, 0,
           77, 0, 76, 72, 0, 0, 74, 0,
           74, 72, 71, 67, 0, 0, 0, 0],
    kick:  [1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0],
    hat:   [0, 1, 0, 1, 0, 1, 0, 1],
  },
};

const _mfreq = (n) => 440 * Math.pow(2, (n - 69) / 12);

MUSIC.want = (name) => {
  if (name === MUSIC.cur) return;
  MUSIC.cur = name;
  MUSIC.pos = 0;
  MUSIC.next = 0;
  if (name !== 'race') MUSIC.hot = false;
};

MUSIC.intensity = (on) => { MUSIC.hot = !!on; };

MUSIC._note = (t, freq, dur, type, vol) => {
  const ctx = SND.ctx;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.setValueAtTime(vol, t + dur * 0.6);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(SND.master);
  o.start(t); o.stop(t + dur + 0.02);
};

MUSIC._kick = (t) => {
  const ctx = SND.ctx;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.09);
  g.gain.setValueAtTime(0.30, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g); g.connect(SND.master);
  o.start(t); o.stop(t + 0.14);
};

MUSIC._noiseHit = (t, dur, hp, vol) => {
  const ctx = SND.ctx;
  if (!SND._noiseBuf) SND.noise(0.001, 100, 0.0001); // force buffer creation
  if (!SND._noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = SND._noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(SND.master);
  src.start(t); src.stop(t + dur + 0.02);
};

// called once per real frame from the main loop
MUSIC.tick = () => {
  if (!SND.ctx || SND.ctx.state !== 'running' || SND.muted || !MUSIC.cur) return;
  const s = SONGS[MUSIC.cur];
  if (!s) return;
  const ctx = SND.ctx;
  const stepDur = 60 / (s.bpm * (MUSIC.hot ? 1.08 : 1)) / 2; // 8th notes
  if (MUSIC.next === 0 || MUSIC.next < ctx.currentTime - 1) {
    MUSIC.next = ctx.currentTime + 0.06;
    MUSIC.pos = 0;
  }
  while (MUSIC.next < ctx.currentTime + 0.9) {
    const t = MUSIC.next, p = MUSIC.pos;
    const b = s.bass[p % s.bass.length];
    if (b) MUSIC._note(t, _mfreq(b), stepDur * 0.95, 'triangle', 0.115);
    const l = s.lead[p % s.lead.length];
    if (l) MUSIC._note(t, _mfreq(l + (MUSIC.hot ? 12 : 0)), stepDur * 0.9, 'square', 0.055);
    const d = p % 8;
    if (s.kick[d]) MUSIC._kick(t);
    if (s.snare[d]) MUSIC._noiseHit(t, 0.08, 1600, 0.10);
    if (s.hat[d]) MUSIC._noiseHit(t, 0.03, 6000, 0.045);
    MUSIC.scheduled++;
    MUSIC.pos = (p + 1) % s.len;
    MUSIC.next += stepDur;
  }
};
