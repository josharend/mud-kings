// MUD KINGS — main.js : input, game loop, boot
'use strict';

// ---------- input ----------
const INPUT = {
  keys: {},          // held keys by code
  queue: new Set(),  // pressed since last tick
  pressed: new Set(),// pressed during current tick
  p: [
    { steer: 0, gas: false, brake: false, nitroQueued: false },
    { steer: 0, gas: false, brake: false, nitroQueued: false },
  ],
};

INPUT.init = () => {
  const NITRO = { 'Space': 0, 'ShiftLeft': 1, 'ShiftRight': 1, 'KeyQ': 1 };
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      INPUT.queue.add(e.code);
      if (NITRO[e.code] !== undefined) INPUT.p[NITRO[e.code]].nitroQueued = true;
      if (e.code === 'KeyM') {
        SND.unlock();
        SND.toggleMute();
      }
      SND.unlock();
    }
    INPUT.keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => { INPUT.keys[e.code] = false; });
  window.addEventListener('blur', () => { INPUT.keys = {}; });
};

INPUT.beginTick = () => {
  INPUT.pressed = INPUT.queue;
  INPUT.queue = new Set();
  const k = INPUT.keys;
  // P1: arrows
  INPUT.p[0].steer = (k['ArrowLeft'] ? -1 : 0) + (k['ArrowRight'] ? 1 : 0);
  INPUT.p[0].gas = !!k['ArrowUp'];
  INPUT.p[0].brake = !!k['ArrowDown'];
  // P2: WASD
  INPUT.p[1].steer = (k['KeyA'] ? -1 : 0) + (k['KeyD'] ? 1 : 0);
  INPUT.p[1].gas = !!k['KeyW'];
  INPUT.p[1].brake = !!k['KeyS'];
};

INPUT.wasPressed = (code) => INPUT.pressed.has(code);

// ---------- boot & loop ----------
let _canvas, _ctx, _stage;

const _resize = () => {
  const s = Math.max(1, Math.min(window.innerWidth / 512, window.innerHeight / 480));
  const scale = s >= 1.5 ? Math.floor(s * 2) / 2 : s; // half-integer steps look fine
  _stage.style.width = (512 * scale) + 'px';
  _stage.style.height = (480 * scale) + 'px';
};

const STEP = 1 / 60;
let _acc = 0, _last = 0, _usingTimer = false, _rafSeen = false;

const _frame = (now) => {
  _rafSeen = true;
  if (!_last) _last = now;
  let dt = (now - _last) / 1000;
  _last = now;
  if (dt > 0.25) dt = 0.25;
  _acc += dt;
  let steps = 0;
  while (_acc >= STEP && steps < 5) {
    INPUT.beginTick();
    GAME.tick(STEP);
    _acc -= STEP; steps++;
  }
  if (steps === 5) _acc = 0;
  MUSIC.tick();
  GAME.draw(_ctx);
  if (!_usingTimer) requestAnimationFrame(_frame);
};

const _boot = () => {
  _stage = document.getElementById('stage');
  _canvas = document.getElementById('screen');
  _ctx = _canvas.getContext('2d');
  _ctx.imageSmoothingEnabled = false;
  window.addEventListener('resize', _resize);
  _resize();

  SPR.init();
  R3.init(document.getElementById('scene3d')); // sets R3.ready=false cleanly if WebGL/Three.js unavailable
  INPUT.init();
  GAME.init();

  requestAnimationFrame(_frame);
  // fallback for embedded panes where rAF never fires
  setTimeout(() => {
    if (!_rafSeen) {
      _usingTimer = true;
      setInterval(() => _frame(performance.now()), 1000 / 60);
    }
  }, 500);
};

// ---------- debug hooks (headless testing) ----------
const DBG = {
  state: () => ({
    mode: GAME.G.mode, race: GAME.G.raceIdx,
    trucks: GAME.G.trucks.map(t => ({
      name: t.name, x: t.x | 0, y: t.y | 0, lap: t.lap, wp: t.wpIdx,
      spd: Math.hypot(t.vx, t.vy) | 0, fin: t.finished, place: t.place,
    })),
    finishOrder: GAME.G.finishOrder.map(t => t.name),
    players: GAME.G.players,
  }),
  tick: (n = 1, dt = STEP) => { for (let i = 0; i < n; i++) { INPUT.beginTick(); GAME.tick(dt); } },
  draw: () => GAME.draw(_ctx),
  // composites the WebGL race-world canvas under the 2D overlay canvas — the visible
  // page shows both stacked via CSS, but a screenshot needs them flattened into one image
  shot: () => {
    const out = U.mkCanvas(512, 480);
    const octx = out.getContext('2d');
    const scene3d = document.getElementById('scene3d');
    if (scene3d) octx.drawImage(scene3d, 0, 0);
    octx.drawImage(_canvas, 0, 0);
    return out.toDataURL('image/png');
  },
  press: (code) => { INPUT.queue.add(code); },
  autopilot: (on = true) => { // make human trucks drive themselves
    for (const t of GAME.G.trucks) if (!t.isAI) t.isAI = on ? true : (t.playerIdx !== null ? false : t.isAI);
  },
  give: (amt = 50000) => { GAME.G.players[0].money += amt; },
  setRace: (n) => { GAME.G.raceIdx = n; GAME.startRace(); },
};
window.DBG = DBG;

window.addEventListener('DOMContentLoaded', _boot);
