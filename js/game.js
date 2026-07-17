// MUD KINGS — game.js : core game logic, physics, AI, race flow, HUD
'use strict';

const TUNE = {
  LAPS: 5,
  RADIUS: 7,            // truck collision radius vs walls
  TRUCK_R: 8,           // truck vs truck
  WP_RADIUS: 48,
  WP_LOOKAHEAD: 4,      // waypoints scanned ahead — lets a track shortcut skip indices legally.
                         // Must stay well below the smallest track's waypoint count (6) or a
                         // truck lingering near its target could false-trigger a full-lap wrap.
  DRAG: 1.15,
  GRAV: 900,
  PAYOUT: [12000, 8000, 5500, 3500],
  PICKUP_MONEY: 1500,
  NITRO_TIME: 1.0,
  NITRO_ACCEL: 560,
  NITRO_TOPMULT: 1.5,
  RESPAWN_PICKUP: 7,
  SHOP_PRICE: (lvl) => 10000 + 5000 * lvl,
  NITRO_PRICE: 5000,
  MAX_LVL: 5,
  // rubber-band catch-up: trailing trucks claw back, leader eases off a hair
  CATCHUP_SCALE: 5200,   // progress-gap for near-max catch-up (~5 waypoints)
  CATCHUP_ACCEL: 0.20,   // trailing accel bonus at max gap
  CATCHUP_TOP: 0.08,     // trailing top-speed bonus at max gap
  CATCHUP_HUMAN: 1.3,    // humans rubber-band a bit harder (feels winnable)
  CATCHUP_LEAD_PEN: 0.03,// leader's top-speed handicap
};

const STATS = {
  top:   (l) => 160 + 15 * l,
  accel: (l) => 265 + 32 * l,
  turn:  (l) => 4.0 + 0.18 * l,
  grip:  (l) => 4.0 + 0.5 * l,
  shockLoss: (l) => 0.16 - 0.022 * l,
};

const AI_NAMES = ['DUSTY DIAZ', 'BIG RIG RITA', 'SLICK VIC', 'CRUSHER KANE'];

const GAME = {};
let G = null; // global game state

GAME.init = () => {
  G = {
    mode: 'title',
    attractRace: null,
    humans: 1,
    raceIdx: 0,
    season: 1,
    players: [GAME._newPlayer(), GAME._newPlayer()],
    hasSave: !!localStorage.getItem('mudkings_save_v1'),
    trucks: [], track: null, pickups: [],
    particles: [], floaters: [], banners: [],
    stateT: 0, countdownT: 0, raceT: 0, finishT: 0,
    finishOrder: [], shake: 0, frame: 0,
    marks: null, paused: false, muted: false,
  };
  GAME._startAttract();
  GAME.G = G;
};

GAME._newPlayer = () => ({
  money: 0, nitros: 3, chassis: 0,
  upg: { tires: 0, shocks: 0, accel: 0, top: 0 },
  seasonWinnings: 0,
});

// ---------- save / load ----------
GAME.save = () => {
  try {
    localStorage.setItem('mudkings_save_v1', JSON.stringify({
      raceIdx: G.raceIdx, humans: G.humans, season: G.season,
      players: G.players,
    }));
    G.hasSave = true;
  } catch (e) {}
};

GAME.load = () => {
  try {
    const s = JSON.parse(localStorage.getItem('mudkings_save_v1'));
    if (!s) return false;
    G.raceIdx = s.raceIdx; G.humans = s.humans; G.season = s.season || 1;
    G.players = s.players;
    for (const p of G.players) p.chassis = p.chassis || 0;
    return true;
  } catch (e) { return false; }
};

GAME.clearSave = () => { try { localStorage.removeItem('mudkings_save_v1'); } catch (e) {} G.hasSave = false; };

// ---------- trucks ----------
GAME._mkTruck = (colorIdx, isAI, playerIdx, track, slot) => {
  const p = track.slots[slot];
  const lvl = isAI ? GAME._aiLevel(colorIdx) : null;
  const upg = isAI ? { tires: lvl, shocks: lvl, accel: lvl, top: lvl } : G.players[playerIdx].upg;
  const chassis = isAI ? (G.raceIdx + colorIdx) % SPR.CHASSIS.length : G.players[playerIdx].chassis || 0;
  return {
    chassis,
    x: p[0], y: p[1], z: 0, vz: 0,
    heading: track.startDir, vx: 0, vy: 0,
    color: colorIdx, isAI, playerIdx,
    lap: 1, wpIdx: 0, progress: 0,
    nitros: isAI ? Math.min(9, 2 + (G.raceIdx >> 2)) : G.players[playerIdx].nitros,
    boostT: 0, bobPhase: Math.random() * 6, airT: 0,
    stuckT: 0, rescueT: 0, ghostT: 0,
    finished: false, place: 0, raceMoney: 0,
    upg, aiSeed: Math.random() * 1000,
    name: isAI ? AI_NAMES[colorIdx] : (playerIdx === 0 ? 'PLAYER 1' : 'PLAYER 2'),
    lastTerrain: '.', fxT: 0,
  };
};

GAME._aiLevel = (colorIdx) => {
  const base = 0.1 + G.raceIdx * 0.5 + (G.season - 1) * 1.2;
  const pers = [0.25, 0, -0.35, 0.1][colorIdx] || 0;
  return U.clamp(base + pers, 0, TUNE.MAX_LVL);
};

GAME._stat = (t, key) => {
  const l = t.upg[key === 'top' ? 'top' : key === 'accel' ? 'accel' : key === 'turn' || key === 'grip' ? 'tires' : 'shocks'];
  const mod = (SPR.CHASSIS[t.chassis || 0].mods[key]) || 0;
  return STATS[key](l) + mod;
};

// ---------- race setup ----------
GAME.setupRace = (attract) => {
  const track = TRK.make(attract ? 1 : G.raceIdx);
  G.track = track;
  G.trucks = [];
  G.finishOrder = [];
  G.raceT = 0; G.finishT = 0;
  G.particles = []; G.floaters = []; G.banners = [];
  G.marks = U.mkCanvas(TRK.W, TRK.H);
  G.pickups = track.pickups.map(p => ({ ...p, alive: true, t: 0, bob: Math.random() * 6 }));
  const humans = attract ? 0 : G.humans;
  for (let i = 0; i < 4; i++) {
    const isAI = i >= humans;
    G.trucks.push(GAME._mkTruck(i, isAI, isAI ? null : i, track, i));
  }
  G.leaderFinalLap = false;
  G.leadTruck = null;
  G.leadCooldown = 0;

  if (typeof R3 !== 'undefined' && R3.ready) {
    R3.buildTrack(track);
    R3.buildTrucks(G.trucks);
    R3.buildPickups(G.pickups);
  }
};

GAME.startRace = () => {
  GAME.setupRace(false);
  G.mode = 'intro';
  G.stateT = 0;
  G.countdownT = 0;
  for (let i = 0; i < G.humans; i++) SND.startEngine(i);
  SND.crowd(0.25);
  MUSIC.want('race');
  MUSIC.intensity(0);
};

GAME._startAttract = () => {
  GAME.setupRace(true);
  G.mode = 'title';
  G.stateT = 0;
  MUSIC.want('title');
};

// ---------- main tick ----------
GAME.tick = (dt) => {
  if (!G) return;
  G.frame++;
  if (G.paused) {
    if (INPUT.wasPressed('KeyP') || INPUT.wasPressed('Escape')) { G.paused = false; }
    return;
  }
  G.stateT += dt;
  if (G.shake > 0) G.shake -= dt;

  switch (G.mode) {
    case 'title': GAME._tickTitle(dt); break;
    case 'select': GAME._tickSelect(dt); break;
    case 'intro': GAME._tickIntro(dt); break;
    case 'race': GAME._tickRace(dt); break;
    case 'finish': GAME._tickRace(dt); GAME._tickFinish(dt); break;
    case 'results': GAME._tickResults(dt); break;
    case 'shop': SHOP.tick(dt); break;
    case 'champion': GAME._tickChampion(dt); break;
  }
  GAME._particlesTick(dt); // banners/floaters/particles decay in every mode
};

// ---------- title / attract ----------
GAME._tickTitle = (dt) => {
  // background attract race
  GAME._simRace(dt, true);
  const leader = G.trucks.find(t => t.lap > TUNE.LAPS);
  if (leader) GAME._startAttract();

  if (INPUT.wasPressed('Enter')) {
    SND.unlock();
    if (G.hasSave && GAME.load()) { GAME.startRace(); }
    else { GAME._newSeason(1); }
  }
  if (INPUT.wasPressed('Digit1')) { SND.unlock(); GAME._newSeason(1); }
  if (INPUT.wasPressed('Digit2')) { SND.unlock(); GAME._newSeason(2); }
  if (INPUT.wasPressed('KeyN')) { SND.unlock(); GAME.clearSave(); GAME._newSeason(G.humans); }
};

GAME._newSeason = (humans) => {
  GAME.clearSave();
  G.humans = humans;
  G.raceIdx = 0; G.season = 1;
  G.players = [GAME._newPlayer(), GAME._newPlayer()];
  G.mode = 'select';
  G.stateT = 0;
  G.selCursor = 0;
  G.selPlayer = 0;
};

// ---------- truck select ----------
GAME._tickSelect = (dt) => {
  GAME._simRace(dt, true); // attract race keeps rolling behind
  const n = SPR.CHASSIS.length;
  if (INPUT.wasPressed('ArrowLeft') || INPUT.wasPressed('KeyA')) { G.selCursor = (G.selCursor + n - 1) % n; SND.cursor(); }
  if (INPUT.wasPressed('ArrowRight') || INPUT.wasPressed('KeyD')) { G.selCursor = (G.selCursor + 1) % n; SND.cursor(); }
  if (INPUT.wasPressed('Enter') || INPUT.wasPressed('Space')) {
    G.players[G.selPlayer].chassis = G.selCursor;
    SND.buy();
    G.selPlayer++;
    if (G.selPlayer >= G.humans) GAME.startRace();
    else G.selCursor = 0;
  }
};

// ---------- intro ----------
GAME._tickIntro = (dt) => {
  const CARD = 1.6, STEP = 0.8;
  if (G.stateT < CARD) return;
  const t = G.stateT - CARD;
  const step = Math.floor(t / STEP);
  if (step !== G.countdownT) {
    G.countdownT = step;
    if (step <= 2) SND.countBeep();
  }
  if (step >= 3) {
    SND.goBeep();
    SND.crowdSwell();
    G.mode = 'race';
    G.stateT = 0;
    GAME.banner('GO!', 0.8, '#5aff5a');
  }
};

// ---------- race ----------
GAME._tickRace = (dt) => {
  G.raceT += dt;
  GAME._simRace(dt, false);

  // engine sounds
  for (let i = 0; i < G.humans; i++) {
    const t = G.trucks[i];
    const spd = Math.hypot(t.vx, t.vy);
    SND.engineUpdate(i, U.clamp(spd / 230, 0, 1), t.boostT > 0);
  }

  if (INPUT.wasPressed('KeyP') || INPUT.wasPressed('Escape')) G.paused = true;

  if (G.mode === 'race') {
    // lead-change drama (settle first, then announce swaps, throttled)
    if (G.leadCooldown > 0) G.leadCooldown -= dt;
    const front = GAME._ranked()[0];
    if (front && !front.finished) {
      if (G.leadTruck && front !== G.leadTruck && G.raceT > 4 && G.leadCooldown <= 0 && !G.leaderFinalLap) {
        GAME.banner(front.name + ' TAKES THE LEAD!', 1.3, '#ffd040');
        SND.crowdSwell();
        G.leadCooldown = 4;
      }
      G.leadTruck = front;
    }
    // leader on final lap?
    if (!G.leaderFinalLap) {
      const lead = front;
      if (lead && lead.lap === TUNE.LAPS) {
        G.leaderFinalLap = true;
        GAME.banner('FINAL LAP!', 1.6, '#ffd040');
        SND.crowdSwell();
        MUSIC.intensity(1);
      }
    }
    // someone finished -> finish phase
    if (G.finishOrder.length > 0) {
      G.mode = 'finish';
      G.finishT = 0;
      GAME.banner('FINISH!', 1.6, '#ffffff');
      SND.fanfare(false);
      SND.crowdSwell();
    }
  }
};

GAME._tickFinish = (dt) => {
  G.finishT += dt;
  const humansDone = G.trucks.filter(t => !t.isAI).every(t => t.finished);
  if ((humansDone && G.finishT > 1.2) || G.finishT > 14) {
    // place unfinished trucks by progress
    const rest = GAME._ranked().filter(t => !t.finished);
    for (const t of rest) { t.finished = true; t.place = G.finishOrder.length + 1; G.finishOrder.push(t); }
    // payouts
    for (const t of G.finishOrder) {
      const pay = TUNE.PAYOUT[t.place - 1] || 2000;
      t.racePayout = pay;
      if (!t.isAI) {
        G.players[t.playerIdx].money += pay;
        G.players[t.playerIdx].seasonWinnings += pay + t.raceMoney;
        G.players[t.playerIdx].nitros = t.nitros;
      }
    }
    SND.stopEngines();
    SND.crowd(0.12);
    G.mode = 'results';
    G.stateT = 0;
    MUSIC.want(null);
    SND.fanfare(true);
  }
};

// ---------- results ----------
GAME._tickResults = (dt) => {
  if (G.stateT > 0.8 && (INPUT.wasPressed('Enter') || INPUT.wasPressed('Space'))) {
    const doneChamp = ((G.raceIdx + 1) % TRK.defs.length) === 0;
    if (doneChamp) { G.mode = 'champion'; G.stateT = 0; SND.fanfare(true); MUSIC.want('title'); }
    else SHOP.enter();
  }
};

GAME._tickChampion = (dt) => {
  if (G.stateT > 1 && (INPUT.wasPressed('Enter') || INPUT.wasPressed('Space'))) {
    G.season++;
    SHOP.enter();
  }
};

// called by shop when all players done
GAME.nextRace = () => {
  G.raceIdx++;
  GAME.save();
  GAME.startRace();
};

// ---------- simulation ----------
// rubber-band: scale accel/top by how far each truck trails the leader
GAME._catchup = () => {
  let lead = -Infinity, leadTruck = null;
  for (const t of G.trucks) if (t.progress > lead) { lead = t.progress; leadTruck = t; }
  for (const t of G.trucks) {
    const f = U.clamp((lead - t.progress) / TUNE.CATCHUP_SCALE, 0, 1);
    const mult = t.isAI ? 1 : TUNE.CATCHUP_HUMAN;
    t.cuAccel = 1 + f * TUNE.CATCHUP_ACCEL * mult;
    t.cuTop = 1 + f * TUNE.CATCHUP_TOP * mult;
  }
  if (leadTruck) leadTruck.cuTop *= (1 - TUNE.CATCHUP_LEAD_PEN);
};

GAME._simRace = (dt, attract) => {
  const locked = G.mode === 'intro';
  GAME._catchup();
  for (const t of G.trucks) {
    if (t.finished && t.isAI) { GAME._aiControl(t, dt); } // keep driving for show
    if (locked) continue;
    if (t.isAI) GAME._aiControl(t, dt);
    else GAME._humanControl(t, dt);
    GAME._physics(t, dt, attract);
  }
  if (!locked) {
    GAME._truckCollisions();
    GAME._pickupsTick(dt);
  }
  // rank progress metric
  for (const t of G.trucks) {
    const wp = G.track.wps[t.wpIdx % G.track.wps.length];
    t.progress = t.lap * 100000 + t.wpIdx * 1000 - U.dist(t.x, t.y, wp[0], wp[1]);
  }
};

GAME._ranked = () => {
  return [...G.trucks].sort((a, b) => {
    if (a.finished && b.finished) return a.place - b.place;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
};

GAME._humanControl = (t, dt) => {
  const inp = INPUT.p[t.playerIdx];
  t.ctl = { steer: inp.steer, gas: inp.gas, brake: inp.brake, nitro: inp.nitroQueued };
  inp.nitroQueued = false;
};

GAME._aiControl = (t, dt) => {
  const wps = G.track.wps;
  const wp = wps[t.wpIdx % wps.length];
  const nwp = wps[(t.wpIdx + 1) % wps.length];
  const d = U.dist(t.x, t.y, wp[0], wp[1]);
  // blend target toward next wp when close — 52px radius matches the dense 48px lanes;
  // the old 70px blend (tuned for 64-100px corridors) cut corners into the ridge walls
  const bl = U.clamp(1 - d / 52, 0, 0.8);
  const tx = U.lerp(wp[0], nwp[0], bl), ty = U.lerp(wp[1], nwp[1], bl);
  const desired = Math.atan2(ty - t.y, tx - t.x);
  const diff = U.angDiff(t.heading, desired);
  const spd = Math.hypot(t.vx, t.vy);
  const steer = U.clamp(diff / 0.35, -1, 1); // proportional — no bang-bang wobble
  const gas = !(Math.abs(diff) > 1.1 && spd > 120);
  const brake = Math.abs(diff) > 2.0 && spd > 100;
  let nitro = false;
  if (t.nitros > 0 && t.boostT <= 0 && Math.abs(diff) < 0.12 && d > 110 &&
      Math.random() < 0.008 && !t.finished) nitro = true;
  t.ctl = { steer, gas, brake, nitro };
};

GAME._physics = (t, dt, attract) => {
  const ctl = t.ctl || { steer: 0, gas: false, brake: false, nitro: false };
  const air = t.z > 0.5;
  const terrain = TRK.tileAt(G.track, t.x, t.y);
  const onIce = terrain === 'W' && G.track.theme === 'winter';
  let spd = Math.hypot(t.vx, t.vy);

  if (t.ghostT > 0) t.ghostT -= dt;
  if (t.rescueT > 0) {
    t.rescueT -= dt;
    if (t.rescueT <= 0) GAME._doRescue(t);
    return;
  }

  // steering
  const turn = GAME._stat(t, 'turn');
  t.heading += ctl.steer * turn * dt * (air ? 0.35 : 1);

  // nitro
  if (ctl.nitro && t.nitros > 0 && t.boostT <= 0) {
    t.nitros--; t.boostT = TUNE.NITRO_TIME;
    if (!t.isAI || attract) SND.nitro();
    else if (U.dist(t.x, t.y, G.trucks[0].x, G.trucks[0].y) < 200) SND.nitro();
  }
  const boosting = t.boostT > 0;
  if (boosting) t.boostT -= dt;

  // thrust
  const dx = Math.cos(t.heading), dy = Math.sin(t.heading);
  if (!air) {
    if (ctl.gas) {
      const acc = GAME._stat(t, 'accel') * (t.cuAccel || 1) + (boosting ? TUNE.NITRO_ACCEL : 0);
      t.vx += dx * acc * dt; t.vy += dy * acc * dt;
    }
    if (ctl.brake) {
      t.vx *= Math.max(0, 1 - 4.5 * dt); t.vy *= Math.max(0, 1 - 4.5 * dt);
      if (spd < 25) { t.vx -= dx * 110 * dt; t.vy -= dy * 110 * dt; } // reverse creep
    }
    // traction: kill lateral velocity (barely, on ice)
    const grip = GAME._stat(t, 'grip') * (onIce ? 0.15 : 1);
    const fwd = t.vx * dx + t.vy * dy;
    let lat = -t.vx * dy + t.vy * dx; // signed lateral (perp)
    const latAbs = Math.abs(lat);
    lat *= Math.max(0, 1 - grip * dt);
    t.vx = dx * fwd - dy * lat;
    t.vy = dy * fwd + dx * lat;
    // skid marks + sound
    if (latAbs > 55 && spd > 70) {
      GAME._skidMark(t);
      if (!t.isAI && (G.frame % 9) === 0) SND.skid();
    }
  }

  // drag & terrain
  let drag = TUNE.DRAG;
  let clampMult = 1;
  if (!air) {
    if (terrain === 'M') {
      drag += 3.2; clampMult = 0.5;
      if (t.lastTerrain !== 'M') {
        t.vx *= 0.82; t.vy *= 0.82; // felt "bog" the instant you plow in
        if (!t.isAI) SND.mudSquelch();
      }
      if ((G.frame + t.color) % 3 === 0) GAME._spawnMud(t);
    } else if (terrain === 'W') {
      if (onIce) {
        drag = Math.max(0.35, drag - 0.7); // ice barely slows you — it just stops gripping
        if (t.lastTerrain !== 'W') { if (!t.isAI) SND.skid(); }
        if ((G.frame + t.color) % 4 === 0) GAME._spawnIce(t);
      } else {
        drag += 4.2; clampMult = 0.42;
        if (t.lastTerrain !== 'W') { if (!t.isAI || attract) SND.splash(); GAME._spawnSplash(t, 14); }
        if ((G.frame + t.color) % 3 === 0) GAME._spawnSplash(t, 3);
      }
    } else if (terrain === 'J' && spd > 75) {
      t.vz = Math.min(265, 95 + spd * 0.62);
      t.z = 0.6;
    }
  }
  t.lastTerrain = terrain;

  const dragF = Math.max(0, 1 - drag * dt);
  t.vx *= dragF; t.vy *= dragF;

  // top speed clamp
  spd = Math.hypot(t.vx, t.vy);
  const top = GAME._stat(t, 'top') * (t.cuTop || 1) * (boosting ? TUNE.NITRO_TOPMULT : 1) * clampMult;
  if (spd > top) { const f = Math.max(0.85, top / spd); t.vx *= f; t.vy *= f; }

  // vertical
  if (t.z > 0 || t.vz > 0) {
    t.z += t.vz * dt; t.vz -= TUNE.GRAV * dt;
    t.airT += dt;
    if (t.z <= 0) {
      t.z = 0; t.vz = 0; t.airT = 0;
      const loss = STATS.shockLoss(t.upg.shocks);
      t.vx *= 1 - loss; t.vy *= 1 - loss;
      GAME._spawnDustRing(t);
      if (!t.isAI || attract) SND.land();
    }
  }

  // move with wall collision (axis separated)
  const r = TUNE.RADIUS;
  let nx = t.x + t.vx * dt;
  const probes = (px, py) => TRK.solidAt(G.track, px, py - r * 0.7) ||
                             TRK.solidAt(G.track, px, py) ||
                             TRK.solidAt(G.track, px, py + r * 0.7);
  const sideX = nx + Math.sign(t.vx) * r;
  if (t.vx !== 0 && probes(sideX, t.y)) {
    if (Math.abs(t.vx) > 80) { GAME._hitWall(t, Math.abs(t.vx)); }
    t.vx = -t.vx * 0.42;
    nx = t.x;
  }
  t.x = nx;
  let ny = t.y + t.vy * dt;
  const probesY = (px, py) => TRK.solidAt(G.track, px - r * 0.7, py) ||
                              TRK.solidAt(G.track, px, py) ||
                              TRK.solidAt(G.track, px + r * 0.7, py);
  const sideY = ny + Math.sign(t.vy) * r;
  if (t.vy !== 0 && probesY(t.x, sideY)) {
    if (Math.abs(t.vy) > 80) { GAME._hitWall(t, Math.abs(t.vy)); }
    t.vy = -t.vy * 0.42;
    ny = t.y;
  }
  t.y = ny;

  // dust
  if (!air && spd > 70 && (terrain === '.' || terrain === 'S' || terrain === 'J') &&
      (G.frame + t.color * 3) % 5 === 0) GAME._spawnDust(t);

  // bob
  t.bobPhase += spd * dt * 0.14;

  // waypoints / laps — scans a short window ahead so a truck cutting through a
  // track shortcut can legally skip the indices it bypassed (lap only counts
  // when the jump lands exactly on the wrap-around marker, so cutting through
  // the middle of the map can never accidentally credit a full lap)
  const wps = G.track.wps;
  const n = wps.length;
  let reach = -1;
  for (let k = Math.min(TUNE.WP_LOOKAHEAD, n) - 1; k >= 0; k--) {
    const wp = wps[(t.wpIdx + k) % n];
    if (U.dist(t.x, t.y, wp[0], wp[1]) < TUNE.WP_RADIUS) { reach = k; break; }
  }
  if (reach >= 0) {
    t.wpIdx += reach + 1;
    if (t.wpIdx % n === 0) {
      t.lap++;
      if (!t.finished) {
        if (t.lap > TUNE.LAPS) {
          t.finished = true;
          t.place = G.finishOrder.length + 1;
          G.finishOrder.push(t);
          if (!t.isAI) { GAME.banner(t.name + ' ' + GAME.placeName(t.place) + '!', 2, '#ffd040'); }
        } else if (!t.isAI && G.mode !== 'title') {
          GAME.banner('LAP ' + t.lap, 1.0, '#e0e0ff');
        }
      }
    }
  }

  // stuck rescue
  if (!t.finished && G.mode !== 'intro') {
    const trying = t.isAI || ctl.gas;
    if (spd < 12 && trying && !air) t.stuckT += dt; else t.stuckT = 0;
    if (t.stuckT > 2.5 || TRK.solidAt(G.track, t.x, t.y)) {
      t.stuckT = 0;
      t.rescueT = 0.8;
      if (!t.isAI) SND.rescue();
    }
  }
};

GAME._doRescue = (t) => {
  const wps = G.track.wps;
  const n = wps.length;
  const iPrev = ((t.wpIdx - 1) % n + n) % n;
  const p = wps[iPrev], nx = wps[t.wpIdx % n];
  t.x = p[0]; t.y = p[1];
  t.vx = t.vy = 0; t.z = 0; t.vz = 0;
  t.heading = Math.atan2(nx[1] - p[1], nx[0] - p[0]);
  t.ghostT = 1.2;
};

GAME._hitWall = (t, impact) => {
  if (!t.isAI || U.dist(t.x, t.y, G.trucks[0].x, G.trucks[0].y) < 220) {
    impact > 160 ? SND.crash() : SND.thud();
  }
  if (!t.isAI) G.shake = Math.max(G.shake, U.clamp(impact / 700, 0.08, 0.35));
  GAME._spawnDustRing(t);
  if (impact > 160) { GAME._spawnSparks(t, 5); GAME._spawnImpactFlash(t.x, t.y); }
};

GAME._truckCollisions = () => {
  const R = TUNE.TRUCK_R * 2;
  for (let i = 0; i < G.trucks.length; i++) for (let j = i + 1; j < G.trucks.length; j++) {
    const a = G.trucks[i], b = G.trucks[j];
    if (Math.abs(a.z - b.z) > 8) continue; // one is flying over
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d >= R || d === 0) continue;
    const nx = dx / d, ny = dy / d;
    const push = (R - d) / 2;
    // wall-aware separation: never shove a truck into a solid tile — on dense tracks
    // with 1-tile ridges, an unchecked push embeds trucks in walls (instant rescue)
    const ax2 = a.x - nx * push, ay2 = a.y - ny * push;
    if (!TRK.solidAt(G.track, ax2, ay2)) { a.x = ax2; a.y = ay2; }
    const bx2 = b.x + nx * push, by2 = b.y + ny * push;
    if (!TRK.solidAt(G.track, bx2, by2)) { b.x = bx2; b.y = by2; }
    const van = a.vx * nx + a.vy * ny;
    const vbn = b.vx * nx + b.vy * ny;
    if (van - vbn > 0) {
      const e = 0.76; // forceful bumper-car bounce, arcade-style
      const m = (van + vbn) / 2, dv = (van - vbn) / 2;
      const van2 = m - dv * e, vbn2 = m + dv * e;
      a.vx += (van2 - van) * nx; a.vy += (van2 - van) * ny;
      b.vx += (vbn2 - vbn) * nx; b.vy += (vbn2 - vbn) * ny;
      if (van - vbn > 90 && (!a.isAI || !b.isAI || G.mode === 'title')) {
        SND.thud();
        if (!a.isAI || !b.isAI) G.shake = Math.max(G.shake, 0.15);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        GAME._spawnSparks({ x: mx, y: my }, 4);
        if (van - vbn > 160) GAME._spawnImpactFlash(mx, my);
      }
    }
  }
};

// AI catch-up: applied via stat scaling each frame would be complex; instead nudge velocity
// (kept simple: handled inside _aiLevel by race index; live rubber-band below)
GAME._rubberBand = () => {};

// ---------- pickups ----------
GAME._pickupsTick = (dt) => {
  for (const p of G.pickups) {
    p.bob += dt * 4;
    if (!p.alive) {
      p.t -= dt;
      if (p.t <= 0) p.alive = true;
      continue;
    }
    for (const t of G.trucks) {
      if (t.z > 10) continue;
      if (U.dist(t.x, t.y, p.x, p.y) < 14) {
        p.alive = false; p.t = TUNE.RESPAWN_PICKUP;
        if (p.k === 'money') {
          t.raceMoney += TUNE.PICKUP_MONEY;
          if (!t.isAI) {
            G.players[t.playerIdx].money += TUNE.PICKUP_MONEY;
            SND.pickupMoney();
            GAME.floater(p.x, p.y, '+$1500', '#ffe066');
          }
        } else {
          t.nitros = Math.min(9, t.nitros + 1);
          if (!t.isAI) { SND.pickupNitro(); GAME.floater(p.x, p.y, 'NITRO!', '#5aff5a'); }
        }
        break;
      }
    }
  }
};

// ---------- particles ----------
GAME._spawnDust = (t) => {
  G.particles.push({
    x: t.x - Math.cos(t.heading) * 10, y: t.y - Math.sin(t.heading) * 10,
    vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20 - 8,
    life: 0.5, max: 0.5, size: 2 + Math.random() * 3, col: '200,160,110', growAmt: 0.7,
  });
};
GAME._spawnMud = (t) => {
  for (let i = 0; i < 2; i++) G.particles.push({
    x: t.x, y: t.y, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90,
    life: 0.4, max: 0.4, size: 2.5, col: '90,56,30', growAmt: 0.3, alphaMax: 0.85,
  });
};
GAME._spawnSplash = (t, n) => {
  for (let i = 0; i < n; i++) G.particles.push({
    x: t.x, y: t.y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120,
    life: 0.35, max: 0.35, size: 2, col: '160,200,235', growAmt: 0.15, alphaMax: 0.9,
  });
};
GAME._spawnIce = (t) => {
  G.particles.push({
    x: t.x - Math.cos(t.heading) * 9, y: t.y - Math.sin(t.heading) * 9,
    vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60,
    life: 0.3, max: 0.3, size: 2, col: '240,250,255', growAmt: 0.1,
  });
};
GAME._spawnDustRing = (t) => {
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * U.TAU;
    G.particles.push({
      x: t.x + Math.cos(a) * 6, y: t.y + Math.sin(a) * 4,
      vx: Math.cos(a) * 60, vy: Math.sin(a) * 40,
      life: 0.4, max: 0.4, size: 3, col: '200,160,110', growAmt: 0.9,
    });
  }
};
GAME._spawnSparks = (t, n) => {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * U.TAU, spd = 130 + Math.random() * 110;
    G.particles.push({
      x: t.x, y: t.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      life: 0.14 + Math.random() * 0.1, max: 0.24,
      col: Math.random() < 0.5 ? '255,240,180' : '255,170,70', kind: 'spark',
    });
  }
};
GAME._spawnImpactFlash = (x, y) => {
  G.particles.push({ x, y, vx: 0, vy: 0, life: 0.22, max: 0.22, col: '255,255,255', kind: 'flash' });
};
GAME._particlesTick = (dt) => {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) G.particles.splice(i, 1);
  }
  for (let i = G.floaters.length - 1; i >= 0; i--) {
    const f = G.floaters[i];
    f.y -= 22 * dt; f.life -= dt;
    if (f.life <= 0) G.floaters.splice(i, 1);
  }
  for (let i = G.banners.length - 1; i >= 0; i--) {
    G.banners[i].life -= dt;
    if (G.banners[i].life <= 0) G.banners.splice(i, 1);
  }
};

GAME._skidMark = (t) => {
  const g = G.marks.getContext('2d');
  g.fillStyle = 'rgba(60,40,24,0.18)';
  const bx = -Math.cos(t.heading), by = -Math.sin(t.heading);
  const px = -by, py = bx;
  for (const s of [-4, 4]) {
    g.fillRect(t.x + bx * 8 + px * s - 1, t.y + by * 8 + py * s - 1, 2, 2);
  }
};

GAME.floater = (x, y, txt, col) => G.floaters.push({ x, y, txt, col, life: 1.1 });
GAME.banner = (txt, dur, col) => G.banners.push({ txt, col: col || '#fff', life: dur, max: dur });
GAME.placeName = (p) => ['1ST', '2ND', '3RD', '4TH'][p - 1] || p + 'TH';

// ============================================================
// DRAWING
// ============================================================
GAME.draw = (ctx) => {
  if (!G) return;
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  if (G.shake > 0) ctx.translate((Math.random() * 4 - 2) | 0, (Math.random() * 4 - 2) | 0);

  switch (G.mode) {
    case 'title': GAME._drawRaceWorld(ctx); GAME._drawTitle(ctx); break;
    case 'select': GAME._drawRaceWorld(ctx); GAME._drawSelect(ctx); break;
    case 'intro': GAME._drawRaceWorld(ctx); GAME._drawHud(ctx); GAME._drawIntro(ctx); break;
    case 'race':
    case 'finish': GAME._drawRaceWorld(ctx); GAME._drawHud(ctx); break;
    case 'results': GAME._drawRaceWorld(ctx); GAME._drawResults(ctx); break;
    case 'shop': SHOP.draw(ctx); break;
    case 'champion': GAME._drawRaceWorld(ctx); GAME._drawChampion(ctx); break;
  }

  // banners
  let by = 150;
  for (const b of G.banners) {
    const a = Math.min(1, b.life / 0.3);
    U.text(ctx, b.txt, 256, by, { scale: 4, color: b.col, align: 'center', outline: '#181008', alpha: a });
    by += 34;
  }
  if (G.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 512, 480);
    U.text(ctx, 'PAUSED', 256, 220, { scale: 4, color: '#fff', align: 'center', outline: '#000' });
    U.text(ctx, 'P OR ESC TO RESUME', 256, 260, { scale: 1, color: '#aab', align: 'center' });
  }
  ctx.restore();

  // arcade-cabinet CRT pass: scanlines + vignette, in fixed screen space so
  // shake never distorts it — this is what makes it read as a real cabinet
  GAME._ensureFX(ctx);
  ctx.fillStyle = GAME._scanlinePattern; ctx.fillRect(0, 0, 512, 480);
  ctx.drawImage(GAME._vignetteCanvas, 0, 0);
};

GAME._ensureFX = (ctx) => {
  if (!GAME._scanlinePattern) {
    const t = U.mkCanvas(1, 2);
    const tg = t.getContext('2d');
    tg.fillStyle = 'rgba(0,0,0,0.16)'; tg.fillRect(0, 1, 1, 1);
    GAME._scanlinePattern = ctx.createPattern(t, 'repeat');
  }
  if (!GAME._vignetteCanvas) {
    const c = U.mkCanvas(512, 480);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(256, 240, 140, 256, 240, 380);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.26)');
    g.fillStyle = grad; g.fillRect(0, 0, 512, 480);
    GAME._vignetteCanvas = c;
  }
};

GAME._drawRaceWorld = (ctx) => {
  if (typeof R3 !== 'undefined' && R3.ready) GAME._drawRaceWorld3D(ctx);
  else GAME._drawRaceWorld2D(ctx);
};

// primary path: Three.js renders the actual scene, the 2D canvas becomes a thin
// transparent overlay for particles/floaters only (cheap, and they read fine as flat FX)
GAME._drawRaceWorld3D = (ctx) => {
  R3.syncTrucks(G.trucks, G.frame);
  R3.syncPickups(G.pickups);
  R3.setNight(G.track.theme === 'night');
  R3.render();
  ctx.clearRect(0, 0, 512, 480);
  GAME._drawOverlayFX(ctx);
};

GAME._drawOverlayFX = (ctx) => {
  for (const p of G.particles) {
    const a = p.life / p.max;
    if (p.kind === 'spark') {
      ctx.strokeStyle = `rgba(${p.col},${a.toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
      ctx.stroke();
    } else if (p.kind === 'flash') {
      ctx.strokeStyle = `rgba(${p.col},${(a * 0.7).toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, (1 - a) * 16 + 2, 0, U.TAU); ctx.stroke();
    } else {
      const grow = 1 + (1 - a) * (p.growAmt || 0.5);
      ctx.fillStyle = `rgba(${p.col},${(a * (p.alphaMax || 0.75)).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.6, p.size * grow / 2), 0, U.TAU); ctx.fill();
    }
  }
  for (const f of G.floaters) {
    U.text(ctx, f.txt, f.x | 0, f.y | 0, { align: 'center', color: f.col, outline: '#181008', alpha: Math.min(1, f.life) });
  }
};

// fallback path if WebGL/Three.js failed to load — the original full 2D renderer, unchanged
GAME._drawRaceWorld2D = (ctx) => {
  ctx.drawImage(G.track.canvas, 0, 0);
  ctx.drawImage(G.marks, 0, 0);

  // animated water glints
  const wt = G.track.waterTiles;
  if (wt.length) {
    ctx.fillStyle = 'rgba(180,215,245,0.7)';
    for (let i = 0; i < 3; i++) {
      const tl = wt[(Math.random() * wt.length) | 0];
      ctx.fillRect(tl[0] + ((Math.random() * 12) | 0), tl[1] + ((Math.random() * 13) | 0), 3, 1);
    }
  }
  // crowd shimmer
  const cs = G.track.crowdSpots;
  if (cs.length) {
    const CROWD = ['#e04040', '#e8c040', '#40a0e0', '#40c080', '#e080c0', '#f0ece0'];
    for (let i = 0; i < 14; i++) {
      const s = cs[(Math.random() * cs.length) | 0];
      ctx.fillStyle = CROWD[(Math.random() * CROWD.length) | 0];
      ctx.fillRect(s[0], s[1], 2, 2);
    }
  }

  // pickups
  for (const p of G.pickups) {
    if (!p.alive) continue;
    const bob = Math.sin(p.bob) * 2;
    ctx.fillStyle = 'rgba(20,14,8,0.4)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, 6, 2.5, 0, 0, U.TAU); ctx.fill();
    const spr = p.k === 'money' ? SPR.moneyBag : SPR.nitroCan;
    ctx.drawImage(spr, (p.x - spr.width / 2) | 0, (p.y - spr.height / 2 - 4 + bob) | 0);
  }

  // night: headlight cones + taillights under the trucks
  if (G.track.theme === 'night') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const t of G.trucks) {
      if (t.rescueT > 0) continue;
      const dx = Math.cos(t.heading), dy = Math.sin(t.heading);
      const px = -dy, py = dx;
      ctx.fillStyle = 'rgba(255,240,180,0.27)';
      ctx.beginPath();
      ctx.moveTo(t.x + dx * 9 - px * 5, t.y + dy * 9 - py * 5);
      ctx.lineTo(t.x + dx * 9 + px * 5, t.y + dy * 9 + py * 5);
      ctx.lineTo(t.x + dx * 48 + px * 15, t.y + dy * 48 + py * 15);
      ctx.lineTo(t.x + dx * 48 - px * 15, t.y + dy * 48 - py * 15);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#ff3020';
    for (const t of G.trucks) {
      if (t.rescueT > 0) continue;
      const dx = Math.cos(t.heading), dy = Math.sin(t.heading);
      const px = -dy, py = dx;
      ctx.fillRect((t.x - dx * 10 - px * 4) | 0, (t.y - dy * 10 - py * 4 - t.z * 0.45) | 0, 2, 2);
      ctx.fillRect((t.x - dx * 10 + px * 4) | 0, (t.y - dy * 10 + py * 4 - t.z * 0.45) | 0, 2, 2);
    }
  }

  // trucks: shadows first, then bodies sorted by z
  for (const t of G.trucks) {
    if (t.rescueT > 0) continue;
    const sq = 1 - Math.min(0.4, t.z / 120);
    ctx.fillStyle = 'rgba(20,14,8,0.4)';
    ctx.beginPath(); ctx.ellipse(t.x, t.y + 3, 11 * sq, 5 * sq, 0, 0, U.TAU); ctx.fill();
  }
  const order = [...G.trucks].sort((a, b) => a.z - b.z);
  for (const t of order) {
    if (t.rescueT > 0) {
      // rescue blink
      if ((G.frame >> 2) & 1) continue;
    }
    if (t.ghostT > 0 && ((G.frame >> 2) & 1)) continue;
    const idx = SPR.headingIndex(t.heading);
    const spd = Math.hypot(t.vx, t.vy);
    const bob = t.z > 0 ? 0 : Math.sin(t.bobPhase) * (spd / 240) * 2.3;
    const scale = 1 + Math.min(0.35, t.z / 260);
    const fr = SPR.truck(t.color, t.chassis)[idx];
    const w = fr.width * scale;
    const dy = t.y - t.z * 0.45 + bob;
    if (t.boostT > 0) {
      const fl = SPR.flames[idx][(G.frame >> 2) & 1];
      ctx.drawImage(fl, (t.x - 24) | 0, (dy - 24) | 0);
    }
    ctx.drawImage(fr, (t.x - w / 2) | 0, (dy - w / 2) | 0, w | 0, w | 0);
  }

  GAME._drawOverlayFX(ctx);
};

// ---------- HUD ----------
GAME._drawHud = (ctx) => {
  const ranked = GAME._ranked();

  // slim top strip: race title only — the drama lives in the corner panel + banners
  ctx.fillStyle = 'rgba(8,6,10,0.6)';
  ctx.fillRect(136, 0, 240, 13);
  U.text(ctx, 'RACE ' + (G.raceIdx + 1) + ' - ' + G.track.name, 256, 3, { align: 'center', color: '#8fd' });

  // chunky arcade corner readout, bottom-left like the cabinet: big timer, one colored
  // lap digit per truck, nitro bottles, place + cash per human
  const x = 6, y = 388, w = 150, h = 86;
  ctx.fillStyle = 'rgba(8,6,10,0.78)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#9aa2ac'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = '#565b63'; ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);

  const tm = Math.floor(G.raceT);
  U.text(ctx, Math.floor(tm / 60) + ':' + ('' + (tm % 60)).padStart(2, '0') + '.' + (((G.raceT % 1) * 10) | 0),
    x + 8, y + 7, { scale: 2, color: '#f0ece0' });

  U.text(ctx, 'LAP', x + 8, y + 26, { color: '#9aa' });
  for (let i = 0; i < G.trucks.length; i++) {
    const t = G.trucks[i];
    U.text(ctx, '' + Math.min(t.lap, TUNE.LAPS), x + 42 + i * 24, y + 22, { scale: 2, color: SPR.PALETTES[t.color].light });
  }

  U.text(ctx, 'NITRO', x + 8, y + 42, { color: '#9aa' });
  for (let i = 0; i < G.humans; i++) {
    const t = G.trucks[i];
    for (let n = 0; n < Math.min(t.nitros, 8); n++) {
      ctx.fillStyle = '#d02818'; ctx.fillRect(x + 42 + i * 54 + n * 6, y + 41, 4, 7);
      ctx.fillStyle = '#9aa2a8'; ctx.fillRect(x + 42 + i * 54 + n * 6, y + 39, 4, 2);
    }
    if (t.nitros > 8) U.text(ctx, '+', x + 42 + i * 54 + 48, y + 41, { color: '#f66' });
  }

  for (let i = 0; i < G.humans; i++) {
    const t = G.trucks[i];
    const pos = t.finished ? t.place : ranked.indexOf(t) + 1;
    U.text(ctx, 'P' + (i + 1), x + 8, y + 56 + i * 13, { color: SPR.PALETTES[t.color].light });
    U.text(ctx, GAME.placeName(pos), x + 30, y + 56 + i * 13, { color: '#ffd040' });
    U.text(ctx, U.fmtMoney(G.players[t.playerIdx].money), x + 62, y + 56 + i * 13, { color: '#ffe066' });
  }
};

// ---------- title ----------
GAME._drawTitle = (ctx) => {
  ctx.fillStyle = 'rgba(8,6,14,0.62)';
  ctx.fillRect(0, 0, 512, 480);

  const wob = Math.sin(G.stateT * 2) * 4;
  // logo
  U.text(ctx, 'MUD', 256, 92 + wob, { scale: 9, color: '#8a5a33', align: 'center', outline: '#1a0f06' });
  U.text(ctx, 'KINGS', 256, 152 + wob, { scale: 9, color: '#ffd040', align: 'center', outline: '#1a0f06' });
  U.text(ctx, 'STADIUM OFF-ROAD CHAMPIONSHIP', 256, 214, { scale: 2, color: '#e8e4da', align: 'center', outline: '#000' });

  // truck lineup
  for (let i = 0; i < 4; i++) {
    const fr = SPR.truck(i, i % SPR.CHASSIS.length)[4]; // facing right
    ctx.drawImage(fr, 176 + i * 44, 238, 32, 32);
  }

  if ((G.frame >> 4) & 1 || G.stateT < 4) {
    U.text(ctx, G.hasSave ? 'ENTER: CONTINUE SEASON' : 'PRESS ENTER', 256, 300, { scale: 2, color: '#5aff5a', align: 'center', outline: '#000' });
  }
  U.text(ctx, '1: NEW 1-PLAYER   2: NEW 2-PLAYER' + (G.hasSave ? '   N: WIPE SAVE' : ''), 256, 330, { color: '#aab', align: 'center' });

  U.text(ctx, 'P1: ARROWS + SPACE NITRO', 256, 372, { color: '#8fa', align: 'center' });
  U.text(ctx, 'P2: WASD + SHIFT NITRO', 256, 384, { color: '#f98', align: 'center' });
  U.text(ctx, 'MUD SLOWS - MOGULS JUMP - WATER SOAKS', 256, 400, { color: '#889', align: 'center' });
  U.text(ctx, 'WIN CASH, HIT THE SPEED SHOP, RULE THE STADIUM', 256, 412, { color: '#889', align: 'center' });
  U.text(ctx, 'M: MUTE   P: PAUSE', 256, 436, { color: '#667', align: 'center' });
};

// ---------- truck select ----------
GAME._drawSelect = (ctx) => {
  ctx.fillStyle = 'rgba(8,6,14,0.78)';
  ctx.fillRect(0, 0, 512, 480);
  const pal = SPR.PALETTES[G.selPlayer];
  U.text(ctx, 'PICK YOUR TRUCK', 256, 34, { scale: 4, color: '#ffd040', align: 'center', outline: '#000' });
  U.text(ctx, 'PLAYER ' + (G.selPlayer + 1), 256, 72, { scale: 2, color: pal.light, align: 'center' });

  // stat ranges for bars: top 150-172, accel 253-283, turn 3.65-4.3, grip 3.5-4.6
  const bars = [
    { label: 'SPEED', key: 'top', min: 145, max: 178 },
    { label: 'POWER', key: 'accel', min: 248, max: 288 },
    { label: 'TURN', key: 'turn', min: 3.5, max: 4.45 },
    { label: 'GRIP', key: 'grip', min: 3.3, max: 4.75 },
  ];
  for (let i = 0; i < SPR.CHASSIS.length; i++) {
    const ch = SPR.CHASSIS[i];
    const x = 30 + i * 156, y = 100;
    const sel = i === G.selCursor;
    ctx.fillStyle = sel ? '#2e2a38' : '#1c1922';
    ctx.fillRect(x, y, 144, 268);
    ctx.strokeStyle = sel ? '#ffd040' : '#403a4c';
    ctx.lineWidth = sel ? 2 : 1;
    ctx.strokeRect(x + 1, y + 1, 142, 266);
    ctx.lineWidth = 1;

    U.text(ctx, ch.name, x + 72, y + 12, { scale: 2, color: sel ? '#ffd040' : '#dde', align: 'center' });
    U.text(ctx, ch.tag, x + 72, y + 30, { color: '#8fd', align: 'center' });
    const bobY = sel ? Math.sin(G.stateT * 5) * 3 : 0;
    ctx.drawImage(SPR.truck(G.selPlayer, i)[4], x + 40, y + 44 + bobY, 64, 64);

    for (let b = 0; b < bars.length; b++) {
      const bar = bars[b];
      const v = STATS[bar.key](0) + (ch.mods[bar.key] || 0);
      const frac = U.clamp((v - bar.min) / (bar.max - bar.min), 0.08, 1);
      const by = y + 124 + b * 22;
      U.text(ctx, bar.label, x + 10, by, { color: '#99a' });
      ctx.fillStyle = '#33303a'; ctx.fillRect(x + 46, by, 88, 7);
      ctx.fillStyle = sel ? '#8fd06a' : '#5a7a4c';
      ctx.fillRect(x + 46, by, (88 * frac) | 0, 7);
    }
    // blurb, wrapped by hand at ~22 chars
    const words = ch.blurb.split(' ');
    let line = '', ly = y + 218;
    for (const w of words) {
      if ((line + ' ' + w).length > 24) { U.text(ctx, line, x + 72, ly, { color: '#aab', align: 'center' }); ly += 10; line = w; }
      else line = line ? line + ' ' + w : w;
    }
    if (line) U.text(ctx, line, x + 72, ly, { color: '#aab', align: 'center' });
  }
  if ((G.frame >> 4) & 1) {
    U.text(ctx, 'LEFT/RIGHT: CHOOSE   ENTER: LOCK IN', 256, 396, { scale: 2, color: '#5aff5a', align: 'center', outline: '#000' });
  }
};

// ---------- intro ----------
GAME._drawIntro = (ctx) => {
  const CARD = 1.6;
  if (G.stateT < CARD) {
    ctx.fillStyle = 'rgba(8,6,14,0.7)';
    ctx.fillRect(0, 150, 512, 130);
    ctx.fillStyle = '#ffd040'; ctx.fillRect(0, 150, 512, 3); ctx.fillRect(0, 277, 512, 3);
    U.text(ctx, 'RACE ' + (G.raceIdx + 1), 256, 168, { scale: 2, color: '#fff', align: 'center' });
    U.text(ctx, G.track.name, 256, 195, { scale: 4, color: '#ffd040', align: 'center', outline: '#000' });
    U.text(ctx, TUNE.LAPS + ' LAPS', 256, 240, { scale: 2, color: '#8fd', align: 'center' });
    if (G.track.theme === 'night')
      U.text(ctx, 'NIGHT RACE - UNDER THE LIGHTS', 256, 262, { color: '#b0b8f0', align: 'center' });
    else if (G.track.theme === 'winter')
      U.text(ctx, 'WINTER RACE - WATCH THE ICE!', 256, 262, { color: '#cfe8f8', align: 'center' });
    return;
  }
  // countdown lights
  const step = Math.floor((G.stateT - CARD) / 0.8);
  const cx = 256, cy = 190;
  ctx.fillStyle = '#181820';
  ctx.fillRect(cx - 44, cy - 14, 88, 30);
  ctx.strokeStyle = '#000'; ctx.strokeRect(cx - 44.5, cy - 14.5, 89, 31);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i <= step ? '#e02818' : '#481010';
    ctx.beginPath(); ctx.arc(cx - 24 + i * 24, cy, 9, 0, U.TAU); ctx.fill();
  }
  U.text(ctx, '' + Math.max(1, 3 - step), cx, cy + 26, { scale: 3, color: '#fff', align: 'center', outline: '#000' });
};

// ---------- results ----------
GAME._drawResults = (ctx) => {
  ctx.fillStyle = 'rgba(8,6,14,0.78)';
  ctx.fillRect(40, 60, 432, 340);
  ctx.strokeStyle = '#ffd040'; ctx.strokeRect(40.5, 60.5, 431, 339);
  U.text(ctx, 'RACE ' + (G.raceIdx + 1) + ' RESULTS', 256, 80, { scale: 3, color: '#ffd040', align: 'center', outline: '#000' });
  U.text(ctx, G.track.name, 256, 112, { scale: 1, color: '#8fd', align: 'center' });

  const order = G.finishOrder;
  for (let i = 0; i < order.length; i++) {
    const t = order[i];
    const y = 140 + i * 46;
    const pal = SPR.PALETTES[t.color];
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    if (!t.isAI) { ctx.fillStyle = 'rgba(255,208,64,0.12)'; }
    ctx.fillRect(56, y - 8, 400, 38);
    ctx.drawImage(SPR.truck(t.color, t.chassis)[4], 64, y - 6, 32, 32);
    U.text(ctx, GAME.placeName(t.place), 108, y, { scale: 2, color: i === 0 ? '#ffd040' : '#dde' });
    U.text(ctx, t.name, 108, y + 16, { color: pal.light });
    U.text(ctx, U.fmtMoney(t.racePayout || 0), 400, y + 2, { scale: 2, color: '#5aff5a', align: 'right' });
    if (t.raceMoney) U.text(ctx, '+' + U.fmtMoney(t.raceMoney) + ' PICKUPS', 448, y + 20, { color: '#8a8', align: 'right' });
  }
  if ((G.frame >> 4) & 1) {
    U.text(ctx, 'ENTER: SPEED SHOP', 256, 370, { scale: 2, color: '#5aff5a', align: 'center', outline: '#000' });
  }
};

// ---------- champion ----------
GAME._drawChampion = (ctx) => {
  ctx.fillStyle = 'rgba(8,6,14,0.82)';
  ctx.fillRect(0, 0, 512, 480);
  // confetti
  const rnd = U.rng(G.frame >> 1);
  const CROWD = ['#e04040', '#e8c040', '#40a0e0', '#40c080', '#e080c0'];
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = CROWD[(rnd() * 5) | 0];
    ctx.fillRect((rnd() * 512) | 0, ((rnd() * 480 + G.stateT * 60) % 480) | 0, 3, 3);
  }
  U.text(ctx, 'SEASON ' + G.season, 256, 90, { scale: 2, color: '#8fd', align: 'center' });
  U.text(ctx, 'CHAMPIONSHIP', 256, 116, { scale: 4, color: '#ffd040', align: 'center', outline: '#000' });
  U.text(ctx, 'COMPLETE!', 256, 156, { scale: 4, color: '#ffd040', align: 'center', outline: '#000' });

  // podium with the last race's top three
  const cx = 256, py = 268;
  const podium = [
    { t: G.finishOrder[1], x: cx - 96, h: 26, label: '2ND' },
    { t: G.finishOrder[0], x: cx, h: 44, label: '1ST' },
    { t: G.finishOrder[2], x: cx + 96, h: 16, label: '3RD' },
  ];
  for (const p of podium) {
    if (!p.t) continue;
    ctx.fillStyle = '#565b63'; ctx.fillRect(p.x - 34, py - p.h, 68, p.h);
    ctx.fillStyle = '#6a707a'; ctx.fillRect(p.x - 34, py - p.h, 68, 4);
    ctx.fillStyle = '#43474e'; ctx.fillRect(p.x - 34, py - 4, 68, 4);
    U.text(ctx, p.label, p.x, py - p.h + 6, { color: '#1c1a22', align: 'center' });
    ctx.drawImage(SPR.truck(p.t.color, p.t.chassis)[8], p.x - 24, py - p.h - 50, 48, 48);
    U.text(ctx, p.t.name, p.x, py + 8, { color: SPR.PALETTES[p.t.color].light, align: 'center' });
  }
  // gold trophy on the winner's box face
  const ty = py - podium[1].h + 16;
  ctx.fillStyle = '#ffd040';
  ctx.fillRect(cx - 7, ty, 14, 9);
  ctx.fillRect(cx - 11, ty, 3, 6); ctx.fillRect(cx + 8, ty, 3, 6);
  ctx.fillRect(cx - 2, ty + 9, 4, 4);
  ctx.fillRect(cx - 6, ty + 13, 12, 2);

  for (let i = 0; i < G.humans; i++) {
    U.text(ctx, 'PLAYER ' + (i + 1) + ' SEASON WINNINGS: ' + U.fmtMoney(G.players[i].seasonWinnings), 256, 300 + i * 16, { color: '#ffe066', align: 'center' });
  }
  U.text(ctx, 'THE COMPETITION IS GETTING MEANER...', 256, 344, { color: '#f88', align: 'center' });
  if ((G.frame >> 4) & 1) {
    U.text(ctx, 'ENTER: KEEP RACING', 256, 380, { scale: 2, color: '#5aff5a', align: 'center', outline: '#000' });
  }
};
