// MUD KINGS — tracks.js : track layouts, waypoints, tile-art renderer
'use strict';

const TRK = {
  TILE: 16, COLS: 32, ROWS: 30,
  W: 512, H: 480,
};

// tile chars: G stands, # wall, T tirewall, , grass, . dirt, M mud, W water, J moguls, S start
TRK.SOLID = { 'G': 1, '#': 1, 'T': 1, ',': 1 };

// ---------- grid builders ----------
const _mkGrid = () => {
  const g = [];
  for (let y = 0; y < TRK.ROWS; y++) g.push(new Array(TRK.COLS).fill(','));
  // stands
  for (let y = 0; y < TRK.ROWS; y++) for (let x = 0; x < TRK.COLS; x++)
    if (y < 2 || y > 27 || x < 2 || x > 29) g[y][x] = 'G';
  // wall ring
  for (let x = 2; x <= 29; x++) { g[2][x] = '#'; g[27][x] = '#'; }
  for (let y = 2; y <= 27; y++) { g[y][2] = '#'; g[y][29] = '#'; }
  return g;
};
const _rect = (g, x0, y0, x1, y1, ch) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch;
};

// carves a corridor of `tile` along a closed polyline (tile units), radius halfWidth —
// this is how every track is built now: the arcade's tracks were narrow winding single-lane
// ribbons, not wide rectangles around one island, so the centerline IS the racing line.
// `bulge` (extra radius, tile units) widens a circle AT each vertex on top of the segment
// carving: two perpendicular halfWidth-strips meeting at a sharp corner leave an uncovered
// pocket just past the corner on the outside of the turn, which overshooting trucks clip —
// the bulge fills that pocket so turns actually have room to be driven.
const _carvePath = (g, pts, halfWidth, tile, bulge) => {
  const stampCircle = (cx, cy, r) => {
    const rx0 = Math.max(0, Math.floor(cx - r)), rx1 = Math.min(TRK.COLS - 1, Math.ceil(cx + r));
    const ry0 = Math.max(0, Math.floor(cy - r)), ry1 = Math.min(TRK.ROWS - 1, Math.ceil(cy + r));
    for (let ty = ry0; ty <= ry1; ty++) for (let tx = rx0; tx <= rx1; tx++) {
      if (Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy) <= r) g[ty][tx] = tile;
    }
  };
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy) || 0.001;
    const steps = Math.max(1, Math.ceil(dist * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      stampCircle(x0 + dx * t, y0 + dy * t, halfWidth);
    }
  }
  if (bulge) for (const [px, py] of pts) stampCircle(px, py, halfWidth + bulge);
};
// checkered start patch, safely inside the corridor at the path's first point
const _startPatch = (g, p0) => _rect(g, Math.round(p0[0]) - 1, Math.round(p0[1]) - 1, Math.round(p0[0]), Math.round(p0[1]), 'S');
// facing direction from the start point toward the first real corner
const _startDir = (p0, p1) => Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
// 2x2 grid of start slots, tucked behind p0 along the reverse of the p0->p1 direction.
// p0 sits near the START of its pass, so "behind" it usually runs out of corridor and
// into the outer stadium wall within ~3 tiles — depth here must stay under that on every
// track (verified: max 2.6 tiles here, the old known-safe formula topped out at 2.7).
const _mkSlots = (p0, p1) => {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const d = Math.hypot(dx, dy) || 1;
  const fx = dx / d, fy = dy / d, px = -fy, py = fx;
  const slots = [];
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    const back = 1.0 + row * 0.8, off = (col - 0.5) * 2.4;
    slots.push([p0[0] - fx * back + px * off, p0[1] - fy * back + py * off]);
  }
  return slots;
};

// ---------- track centerlines (tile units) ----------
// Each is a closed loop: point[i] connects to point[i+1], wrapping last-to-first.
// DENSE-MAZE discipline (the real cabinet packs 4-6 parallel lanes per screen):
// - half-integer vertex coords + halfWidth 1.4 carve a clean 3-tile corridor (48px,
//   the width validated playable on the old Hairpin) — integer coords carve only 2.
// - lane pitch 4 with bulge 0.5 leaves exactly 1 solid ridge tile between lanes AND
//   between adjacent same-row vertex bulges (pitch >= 2*(hw+bulge)+0.2, checked per
//   track) — merged bulges would fuse two lanes into one wide corridor, which both
//   looks wrong and legally shortcuts the lap via the waypoint lookahead window.
// - serpentines need an EVEN lane count when the return lane sits on one side, or the
//   last lane ends at the wrong end of the field. Every path starts mid-return-lane so
//   the start grid has carved corridor behind it (start-slot depth is only ~1.8 tiles).
// - deliberate mud 'shortcut' rects bridge one ridge, jumping <=3 waypoint indices —
//   inside the WP_LOOKAHEAD=4 window, so laps still count.
// WIDTH DISCIPLINE v2 (truck-to-lane ratio): INTEGER vertex coords + hw2.0 carve exactly
// 4 tiles (64px) — a truck reads ~half the lane like the cabinet, not wall-to-wall.
// Lane pitch 5 keeps a 1-tile ridge; vertex bulge 0.4 max (pitch >= 2*(hw+b)+0.2).
// Fewer lanes per track (4 + a long straight + a return leg) but same dense-maze read.
const PATH_DUSTBOWL = [[26, 15], [26, 22], [5, 22], [5, 7], [10, 7], [10, 17], [15, 17],
  [15, 7], [20, 7], [20, 17], [26, 17]];
const PATH_HOURGLASS = [[26, 13], [26, 6], [7, 6], [7, 11], [20, 11], [20, 16],
  [7, 16], [7, 21], [26, 21]];
const PATH_SPLASHDOWN = [[5, 15], [5, 22], [26, 22], [26, 7], [21, 7], [21, 17], [16, 17],
  [16, 7], [11, 7], [11, 17], [5, 17]];
const PATH_HAIRPIN = [[26, 17], [20, 17], [20, 7], [15, 7], [15, 17], [10, 17],
  [10, 7], [5, 7], [5, 22], [26, 22], [26, 15]];
const PATH_COLOSSEUM = [[16, 23.5], [6.5, 23.5], [6.5, 7], [13, 7], [13, 19], [19.5, 19],
  [19.5, 7], [26, 7], [26, 23.5]];
const PATH_SIDEWINDER = [[5, 14], [5, 7], [22, 7], [22, 12], [10, 12], [10, 17],
  [26, 17], [26, 22], [5, 22]];
const PATH_GAUNTLET = [[26, 15], [26, 22], [5, 22], [5, 9], [10, 9], [10, 17], [15, 17],
  [15, 9], [20, 9], [20, 17], [26, 17]];
const PATH_HOOK = [[12, 23], [5, 23], [5, 6], [26, 6], [26, 23], [17, 23],
  [17, 11], [21, 11]];

// ---------- track definitions ----------
// wps/slots/pickups in tile units (1 unit = 16px)
TRK.defs = [
  {
    // 4 wide vertical lanes + long bottom straight + east return; shortcut bridges lanes 2->3
    name: 'DUST BOWL',
    build: (g) => {
      _carvePath(g, PATH_DUSTBOWL, 2.0, '.', 0.4);
      _rect(g, 3, 12, 6, 14, 'W');     // lane1 northbound, mid
      _rect(g, 8, 9, 11, 11, 'J');     // lane2 southbound: launch 9, land ~13 mid
      _rect(g, 13, 12, 16, 14, 'M');   // lane3 northbound, mid
      _rect(g, 14, 20, 17, 23, 'M');   // bottom straight
      _rect(g, 11, 11, 13, 13, 'M');   // shortcut: bridges the ridge between lanes 2 and 3
      _startPatch(g, PATH_DUSTBOWL[0]);
    },
    wps: PATH_DUSTBOWL,
    slots: _mkSlots(PATH_DUSTBOWL[0], PATH_DUSTBOWL[1]),
    startDir: _startDir(PATH_DUSTBOWL[0], PATH_DUSTBOWL[1]),
    pickups: [{ x: 12, y: 12, k: 'nitro' }, { x: 20, y: 12, k: 'money' }, { x: 5, y: 17, k: 'money' }],
  },
  {
    // 4 wide horizontal lanes + east return column; shortcut bridges rows 2->3
    name: 'THE HOURGLASS',
    build: (g) => {
      _carvePath(g, PATH_HOURGLASS, 2.0, '.', 0.4);
      _rect(g, 10, 9, 13, 12, 'W');    // row2 eastbound
      _rect(g, 16, 14, 18, 16, 'J');   // row3 westbound: launch 18, land ~14 mid
      _rect(g, 12, 19, 15, 22, 'M');   // row4 eastbound, mid
      _rect(g, 10, 12, 12, 15, 'M');   // shortcut: bridges rows 2 and 3
      _startPatch(g, PATH_HOURGLASS[0]);
    },
    wps: PATH_HOURGLASS,
    slots: _mkSlots(PATH_HOURGLASS[0], PATH_HOURGLASS[1]),
    startDir: _startDir(PATH_HOURGLASS[0], PATH_HOURGLASS[1]),
    pickups: [{ x: 11, y: 13.5, k: 'nitro' }, { x: 17, y: 15, k: 'money' }, { x: 26, y: 18, k: 'money' }],
  },
  {
    // mirrored 4-lane template; winter — two ice lanes, mud, moguls, shortcut
    name: 'SPLASHDOWN',
    build: (g) => {
      _carvePath(g, PATH_SPLASHDOWN, 2.0, '.', 0.4);
      _rect(g, 24, 11, 27, 14, 'W');   // east column northbound, mid
      _rect(g, 14, 11, 17, 13, 'W');   // lane2 northbound, mid
      _rect(g, 19, 9, 22, 11, 'M');    // lane1 southbound, entry side
      _rect(g, 9, 9, 12, 11, 'J');     // lane3 southbound: launch 9, land ~13 mid
      _rect(g, 17, 12, 19, 14, 'M');   // shortcut: bridges lanes 1 and 2
      _startPatch(g, PATH_SPLASHDOWN[0]);
    },
    wps: PATH_SPLASHDOWN,
    slots: _mkSlots(PATH_SPLASHDOWN[0], PATH_SPLASHDOWN[1]),
    startDir: _startDir(PATH_SPLASHDOWN[0], PATH_SPLASHDOWN[1]),
    pickups: [{ x: 18, y: 13, k: 'nitro' }, { x: 26, y: 18, k: 'money' }, { x: 11, y: 15, k: 'money' }],
  },
  {
    // the Dust Bowl maze run the OTHER direction, five hazards, NO shortcut — the monster
    name: 'HAIRPIN HAVOC',
    build: (g) => {
      _carvePath(g, PATH_HAIRPIN, 2.0, '.', 0.4);
      // hazard EXIT zones (mogul landings ~3 tiles downstream, mud crawl-outs) placed
      // per lane travel direction, clear of the 52px corner-blend zones
      _rect(g, 18, 13, 21, 15, 'J');   // col20 northbound: launch 15, land ~11
      _rect(g, 13, 9, 16, 11, 'M');    // col15 southbound, entry side
      _rect(g, 8, 12, 11, 14, 'M');    // col10 northbound, mid
      _rect(g, 3, 9, 6, 11, 'J');      // col5 southbound: launch 9, land ~13
      _rect(g, 12, 20, 15, 23, 'W');   // bottom straight
      _startPatch(g, PATH_HAIRPIN[0]);
    },
    wps: PATH_HAIRPIN,
    slots: _mkSlots(PATH_HAIRPIN[0], PATH_HAIRPIN[1]),
    startDir: _startDir(PATH_HAIRPIN[0], PATH_HAIRPIN[1]),
    pickups: [{ x: 15, y: 13, k: 'nitro' }, { x: 26, y: 19, k: 'money' }, { x: 10, y: 9, k: 'money' }],
  },
  {
    // 4 wide grand lanes — the fast open one, with a big mogul field and a pond
    name: 'THE COLOSSEUM',
    build: (g) => {
      _carvePath(g, PATH_COLOSSEUM, 2.2, '.', 0.7);
      _rect(g, 10, 10, 14, 12, 'J');
      _rect(g, 17, 13, 21, 16, 'W');
      _rect(g, 24, 11, 27, 14, 'M');
      _startPatch(g, PATH_COLOSSEUM[0]);
    },
    wps: PATH_COLOSSEUM,
    slots: _mkSlots(PATH_COLOSSEUM[0], PATH_COLOSSEUM[1]),
    startDir: _startDir(PATH_COLOSSEUM[0], PATH_COLOSSEUM[1]),
    pickups: [{ x: 13, y: 15, k: 'nitro' }, { x: 19, y: 14.5, k: 'money' }, { x: 6.5, y: 12, k: 'money' }],
  },
  {
    // snake: 4 full-width rows + west return, alternating hazards; shortcut bridges rows 2->3
    name: 'SIDEWINDER',
    build: (g) => {
      _carvePath(g, PATH_SIDEWINDER, 2.0, '.', 0.4);
      _rect(g, 11, 6, 14, 8, 'M');     // row1 eastbound
      _rect(g, 16, 10, 19, 12, 'J');   // row2 westbound: launch 19, land ~15
      _rect(g, 12, 15, 15, 17, 'W');   // row3 eastbound
      _rect(g, 16, 20, 19, 22, 'J');   // row4 westbound: launch 19, land ~15
      _rect(g, 13, 13, 15, 15, 'M');   // shortcut: bridges rows 2 and 3
      _startPatch(g, PATH_SIDEWINDER[0]);
    },
    wps: PATH_SIDEWINDER,
    slots: _mkSlots(PATH_SIDEWINDER[0], PATH_SIDEWINDER[1]),
    startDir: _startDir(PATH_SIDEWINDER[0], PATH_SIDEWINDER[1]),
    pickups: [{ x: 17, y: 11, k: 'nitro' }, { x: 26, y: 20, k: 'money' }, { x: 5, y: 18, k: 'money' }],
  },
  {
    // 4 short lanes with a hazard in every one + mogul field on the long straight — the gauntlet
    name: 'THE GAUNTLET',
    build: (g) => {
      _carvePath(g, PATH_GAUNTLET, 2.0, '.', 0.4);
      // short lanes can't contain a mogul launch + landing + two corner-blend zones,
      // so moguls live on the long bottom straight; lanes get ice/mud only (2 ice max)
      _rect(g, 3, 13, 6, 15, 'W');     // lane1 northbound (the long lane)
      _rect(g, 8, 10, 11, 12, 'M');    // lane2 southbound, entry
      _rect(g, 13, 13, 16, 15, 'M');   // lane3 northbound
      _rect(g, 18, 10, 21, 12, 'W');   // lane4 southbound, entry
      _rect(g, 11, 20, 14, 23, 'J');   // bottom straight westbound: launch 14, land ~10
      _startPatch(g, PATH_GAUNTLET[0]);
    },
    wps: PATH_GAUNTLET,
    slots: _mkSlots(PATH_GAUNTLET[0], PATH_GAUNTLET[1]),
    startDir: _startDir(PATH_GAUNTLET[0], PATH_GAUNTLET[1]),
    pickups: [{ x: 18, y: 22, k: 'nitro' }, { x: 26, y: 19, k: 'money' }, { x: 4, y: 14, k: 'money' }],
  },
  {
    // big outer ring, an inner hook curling to a dead-ahead tip, and a diagonal chute home
    name: 'THE HOOK',
    build: (g) => {
      _carvePath(g, PATH_HOOK, 2.0, '.', 0.4);
      _rect(g, 9, 5, 12, 7, 'J');      // top straight eastbound: launch 12, land ~16
      _rect(g, 24, 13, 27, 16, 'W');   // east column southbound, mid
      _rect(g, 15, 15, 18, 17, 'M');   // hook column northbound, mid
      _startPatch(g, PATH_HOOK[0]);
    },
    wps: PATH_HOOK,
    slots: _mkSlots(PATH_HOOK[0], PATH_HOOK[1]),
    startDir: _startDir(PATH_HOOK[0], PATH_HOOK[1]),
    pickups: [{ x: 16, y: 18, k: 'nitro' }, { x: 21, y: 11, k: 'money' }, { x: 26, y: 10, k: 'money' }],
  },
];

TRK.BILLBOARDS = ['MUD KING COLA', 'NITRO+', "JOSH'S GARAGE", 'TIRE TOWN',
                  'BIG AIR SODA', '4X4 4EVER', 'ROAR FM 98.9', 'DIRT WAX'];

// season race themes (one per base track); winter turns water tiles into slippery ice
// 0 DustBowl 1 Hourglass 2 Splashdown 3 Hairpin 4 Colosseum 5 Sidewinder 6 Gauntlet 7 Hook
TRK.THEME_CYCLE = ['day', 'day', 'winter', 'night', 'day', 'night', 'winter', 'night'];

TRK.THEMES = {
  day: {
    // saturated rust-orange dirt with strong value range — mid-tan read as washed out
    dirt: (j) => `rgb(${198 + j},${120 + j},${62 + j})`,
    dSpeck1: '#8f5626', dSpeck2: '#d9995c', pebble: '#8a6a48',
    // "grass" = the non-drivable infield. The real arcade is nearly all dirt — rough
    // dark scrub between lanes, not golf-course green (green read as mini-golf).
    grass: '#8a4f24', gSpeck1: '#a05f2e', gSpeck2: '#63350f',
    waterBase: '#3f6f9e', waterDark: '#35608c', waterGlint: '#7fa8d0', waterRim: '#b89060',
    mogulHi: '#e8a95e', mogulLo: '#7d4418', mogulMid: '#c07f40',
    rut1: 'rgba(90,46,16,0.30)', rut2: 'rgba(62,32,12,0.30)',
    glintCol: 'rgba(180,215,245,0.7)',
    dirtBase: '#bd7a44', dirtDark: '#54280e', dirtLight: '#e3a86a',
    mudBase: '#5c3a20', mudDark: '#281608', mudLight: '#6e4a28',
    railA: '#c8342a', railADk: '#8e1f17', railB: '#e6e2d6', railBDk: '#b8b4aa',
  },
  winter: {
    dirt: (j) => `rgb(${218 + j},${224 + j},${231 + j})`,
    dSpeck1: '#b0bcc8', dSpeck2: '#f2f7fb', pebble: '#8a949e',
    grass: '#c2cfd8', gSpeck1: '#dde7ee', gSpeck2: '#a4b2bc',
    waterBase: '#a8cce0', waterDark: '#8fb8d0', waterGlint: '#eef8ff', waterRim: '#7fa0b8',
    mogulHi: '#f2f7fb', mogulLo: '#93a4b4', mogulMid: '#ccdae4',
    rut1: 'rgba(120,95,70,0.22)', rut2: 'rgba(96,74,52,0.22)',
    glintCol: 'rgba(255,255,255,0.8)',
    dirtBase: '#d8dee4', dirtDark: '#a8b4c0', dirtLight: '#f4f8fc',
    mudBase: '#8a9aa8', mudDark: '#5a6874', mudLight: '#c8d4de',
    railA: '#c8342a', railADk: '#8e1f17', railB: '#e6e2d6', railBDk: '#b8b4aa',
  },
};
TRK.THEMES.night = TRK.THEMES.day; // night = day colors + darkening pass

// ---------- shared terrain height field ----------
// Used by BOTH the baked relief shading in the 2D texture AND the 3D ground displacement,
// so painted light and actual geometry always agree. The track is carved into a dirt bowl:
// berm height grows with BFS distance from the drivable corridor (ridges between lanes,
// mesas in wide infields), plus gentle deterministic noise; the stands/wall ring stays flat.
TRK.BERM_AMP = 24;
TRK.NOISE_AMP = 5;
TRK.mkHeightField = (track) => {
  const CO = TRK.COLS, RO = TRK.ROWS;
  const DRIV = { '.': 1, 'S': 1, 'J': 1, 'M': 1, 'W': 1 };
  const dist = new Int16Array(CO * RO).fill(999);
  const queue = [];
  for (let ty = 0; ty < RO; ty++) for (let tx = 0; tx < CO; tx++) {
    if (DRIV[track.grid[ty][tx]]) { dist[ty * CO + tx] = 0; queue.push(ty * CO + tx); }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi], tx = i % CO, ty = (i / CO) | 0, d = dist[i];
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + ox, ny = ty + oy;
      if (nx < 0 || ny < 0 || nx >= CO || ny >= RO) continue;
      const j = ny * CO + nx;
      if (dist[j] > d + 1) { dist[j] = d + 1; queue.push(j); }
    }
  }
  const tileH = new Float32Array(CO * RO);
  for (let ty = 0; ty < RO; ty++) for (let tx = 0; tx < CO; tx++) {
    const ch = track.grid[ty][tx], i = ty * CO + tx;
    if (ch === 'G' || ch === '#' || DRIV[ch]) { tileH[i] = 0; continue; }
    tileH[i] = Math.min(dist[i], 3) / 3 * TRK.BERM_AMP;
  }
  // deterministic per-track noise (seeded from the name so it never re-randomizes)
  let hsh = 0;
  for (let i = 0; i < track.name.length; i++) hsh = (hsh * 31 + track.name.charCodeAt(i)) | 0;
  const rnd = U.rng((hsh >>> 0) || 1);
  const GX = 10, GZ = 10, pts = [];
  for (let i = 0; i < GX * GZ; i++) pts.push(rnd() * 2 - 1);
  const noise = (wx, wz) => {
    const gx = U.clamp(wx / TRK.W * (GX - 1), 0, GX - 1.0001);
    const gz = U.clamp(wz / TRK.H * (GZ - 1), 0, GZ - 1.0001);
    const x0 = gx | 0, z0 = gz | 0, fx = gx - x0, fz = gz - z0;
    const h00 = pts[z0 * GX + x0], h10 = pts[z0 * GX + x0 + 1];
    const h01 = pts[(z0 + 1) * GX + x0], h11 = pts[(z0 + 1) * GX + x0 + 1];
    return (h00 + (h10 - h00) * fx) * (1 - fz) + (h01 + (h11 - h01) * fx) * fz;
  };
  return (wx, wz) => {
    const gx = U.clamp(wx / 16 - 0.5, 0, CO - 1.0001), gz = U.clamp(wz / 16 - 0.5, 0, RO - 1.0001);
    const x0 = gx | 0, z0 = gz | 0, x1 = Math.min(x0 + 1, CO - 1), z1 = Math.min(z0 + 1, RO - 1);
    const fx = gx - x0, fz = gz - z0;
    const h0 = tileH[z0 * CO + x0] + (tileH[z0 * CO + x1] - tileH[z0 * CO + x0]) * fx;
    const h1 = tileH[z1 * CO + x0] + (tileH[z1 * CO + x1] - tileH[z1 * CO + x0]) * fx;
    const berm = h0 + (h1 - h0) * fz;
    const edgeFade = U.clamp(Math.min(wx, wz, TRK.W - wx, TRK.H - wz) / 48 - 1, 0, 1);
    return berm + noise(wx, wz) * TRK.NOISE_AMP * edgeFade;
  };
};

// ---------- track factory ----------
// season = one pass through all base tracks; subsequent seasons mirror + add hazards
TRK.make = (raceIdx) => {
  const N = TRK.defs.length;
  const defIdx = raceIdx % N;
  const mirrored = (Math.floor(raceIdx / N) % 2) === 1;
  const def = TRK.defs[defIdx];
  const grid = _mkGrid();
  def.build(grid);

  // NOTE: earlier wide-track versions scattered random extra hazards on later seasons.
  // On today's dense 48px lanes a randomly-placed mogul at a corner recreates the
  // launch-into-corner rescue storm (verified on mirrored Hairpin/Gauntlet), and every
  // lane already carries a deliberately-placed hazard — so later seasons escalate purely
  // through AI level, not random terrain.
  const lapAround = Math.floor(raceIdx / N);

  let wps = def.wps.map(p => [p[0] * 16, p[1] * 16]);
  let slots = def.slots.map(p => [p[0] * 16, p[1] * 16]);
  let pickups = def.pickups.map(p => ({ x: p.x * 16, y: p.y * 16, k: p.k }));
  let dir = def.startDir;

  if (mirrored) {
    for (const row of grid) row.reverse();
    wps = wps.map(p => [512 - p[0], p[1]]);
    slots = slots.map(p => [512 - p[0], p[1]]);
    pickups = pickups.map(p => ({ x: 512 - p.x, y: p.y, k: p.k }));
    dir = Math.PI - dir;
  }

  const track = {
    name: def.name + (mirrored ? ' II' : '') + (lapAround > 1 ? ' TURBO' : ''),
    theme: TRK.THEME_CYCLE[raceIdx % TRK.THEME_CYCLE.length],
    grid, wps, slots, startDir: dir, pickups,
    waterTiles: [], crowdSpots: [],
  };
  track.canvas = TRK.render(track, raceIdx);
  return track;
};

TRK.tileAt = (track, px, py) => {
  const tx = px >> 4, ty = py >> 4;
  if (tx < 0 || ty < 0 || tx >= TRK.COLS || ty >= TRK.ROWS) return '#';
  return track.grid[ty][tx];
};
TRK.solidAt = (track, px, py) => !!TRK.SOLID[TRK.tileAt(track, px, py)];

// ---------- rendering ----------
const DRIVABLE = { '.': 1, 'S': 1, 'J': 1, 'M': 1, 'W': 1 };

// builds a solid white-on-transparent mask of every tile matching `pred`, then blurs it —
// this is what turns the blocky tile grid into a smooth organic track outline: no polygon
// math needed, the browser's own blur rounds every inside/outside corner for free.
const _tileMask = (track, pred, blurPx) => {
  const m = U.mkCanvas(TRK.W, TRK.H);
  const mg = m.getContext('2d');
  mg.fillStyle = '#fff';
  for (let ty = 0; ty < TRK.ROWS; ty++) for (let tx = 0; tx < TRK.COLS; tx++) {
    if (pred(track.grid[ty][tx])) mg.fillRect(tx * 16, ty * 16, 16, 16);
  }
  if (!blurPx) return m;
  const b = U.mkCanvas(TRK.W, TRK.H);
  const bg = b.getContext('2d');
  bg.filter = `blur(${blurPx}px)`;
  bg.drawImage(m, 0, 0);
  bg.filter = 'none';
  return b;
};

// paints a continuous painterly surface: a base tone plus hundreds of soft overlapping
// tinted blobs at two scales, then fine speckle grain on top — reads as real terrain
// instead of a repeated tile pattern.
const _paintSurface = (rnd, base, dark, light, blobs) => {
  const f = U.mkCanvas(TRK.W, TRK.H);
  const fg = f.getContext('2d');
  fg.fillStyle = base; fg.fillRect(0, 0, TRK.W, TRK.H);
  const [dr, dg, db] = SPR._hex2rgb(dark), [lr, lg, lb] = SPR._hex2rgb(light);
  for (let i = 0; i < blobs; i++) {
    const x = rnd() * TRK.W, y = rnd() * TRK.H, r = 7 + rnd() * 16;
    fg.fillStyle = `rgba(${dr},${dg},${db},${(0.05 + rnd() * 0.09).toFixed(2)})`;
    fg.beginPath(); fg.arc(x, y, r, 0, U.TAU); fg.fill();
  }
  for (let i = 0; i < blobs * 0.6; i++) {
    const x = rnd() * TRK.W, y = rnd() * TRK.H, r = 4 + rnd() * 9;
    fg.fillStyle = `rgba(${lr},${lg},${lb},${(0.05 + rnd() * 0.08).toFixed(2)})`;
    fg.beginPath(); fg.arc(x, y, r, 0, U.TAU); fg.fill();
  }
  for (let i = 0; i < 2200; i++) {
    fg.fillStyle = rnd() < 0.5 ? `rgba(${dr},${dg},${db},0.14)` : `rgba(${lr},${lg},${lb},0.14)`;
    fg.fillRect((rnd() * TRK.W) | 0, (rnd() * TRK.H) | 0, 1, 1);
  }
  return f;
};

TRK.render = (track, seed) => {
  const c = U.mkCanvas(TRK.W, TRK.H);
  const g = c.getContext('2d');
  const rnd = U.rng(4242 + seed * 13);
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const CROWD = ['#e04040', '#e8c040', '#40a0e0', '#40c080', '#e080c0', '#f0ece0', '#e08030', '#b0b8f0'];
  const C = TRK.THEMES[track.theme] || TRK.THEMES.day;

  // ---- stands + outer stadium wall (unchanged tile-by-tile — these frame the arena) ----
  for (let ty = 0; ty < TRK.ROWS; ty++) for (let tx = 0; tx < TRK.COLS; tx++) {
    const ch = track.grid[ty][tx];
    const x = tx * 16, y = ty * 16;
    if (ch === 'G') {
      R(x, y, 16, 16, '#565b63');
      for (let r = 0; r < 16; r += 4) R(x, y + r, 16, 1, '#43474e');
      R(x, y, 16, 2, '#6a6f78');
      const people = 4 + (rnd() * 3 | 0);
      for (let i = 0; i < people; i++) {
        const px = x + (rnd() * 13 | 0), py = y + 1 + (rnd() * 11 | 0);
        const col = CROWD[rnd() * CROWD.length | 0];
        R(px, py + 1, 2, 2, col);
        R(px + (rnd() < 0.5 ? 0 : 1), py, 1, 1, SPR._mix(col, '#3a3226', 0.55));
        if (rnd() < 0.25) R(px - 1, py + 1, 1, 1, col);
        if (rnd() < 0.35) track.crowdSpots.push([px, py]);
      }
    } else if (ch === '#') {
      const red = ((tx + ty) & 1) === 0;
      R(x, y, 16, 16, red ? '#c8342a' : '#e6e2d6');
      R(x, y, 16, 3, red ? '#f08078' : '#ffffff');
      R(x, y, 3, 16, red ? '#e05a50' : '#f8f6ee');
      R(x, y + 13, 16, 3, red ? '#7a170f' : '#9a968c');
      R(x + 13, y, 3, 16, red ? '#8e1f17' : '#b8b4aa');
    } else if (ch === ',' || ch === 'T') {
      R(x, y, 16, 16, C.grass);
      for (let i = 0; i < 4; i++) { const cx = x + (rnd() * 13 | 0), cy = y + (rnd() * 13 | 0); R(cx, cy, 3, 2, C.gSpeck2); }
      for (let i = 0; i < 9; i++) { const bx = x + (rnd() * 15 | 0), by = y + (rnd() * 14 | 0); R(bx, by, 1, 2, rnd() < 0.5 ? C.gSpeck1 : C.gSpeck2); }
      if (ch === 'T') {
        for (const ox of [4, 12]) {
          const jx = x + ox + (rnd() * 3 | 0) - 1, jy = y + 8 + (rnd() * 3 | 0) - 1;
          g.fillStyle = '#1e1e24'; g.beginPath(); g.arc(jx, jy, 4, 0, U.TAU); g.fill();
          g.fillStyle = '#34343c'; g.beginPath(); g.arc(jx, jy, 1.8, 0, U.TAU); g.fill();
          g.fillStyle = '#4a4a54'; g.fillRect(jx - 1, jy - 2, 1, 1);
        }
      } else if (rnd() < 0.32) {
        // scattered dirt humps — the cabinet's infield is dense with sculpted bumps,
        // never a flat empty expanse
        const n = 2 + (rnd() * 3 | 0);
        for (let b = 0; b < n; b++) {
          const bx = x + 2 + (rnd() * 11 | 0), by = y + 2 + (rnd() * 11 | 0), r2 = 2 + rnd() * 2;
          g.fillStyle = C.mogulLo; g.beginPath(); g.arc(bx + 0.8, by + 0.8, r2, 0, U.TAU); g.fill();
          g.fillStyle = C.mogulHi; g.beginPath(); g.arc(bx - 0.5, by - 0.5, r2 * 0.72, 0, U.TAU); g.fill();
        }
      } else if (rnd() < 0.05) {
        R(x + 4, y + 6, 7, 5, '#c8a860'); R(x + 4, y + 6, 7, 1, '#e0c888'); R(x + 4, y + 8, 7, 1, '#a8884a');
      } else if (rnd() < 0.04) {
        R(x + 6, y + 8, 4, 5, '#f08020'); R(x + 6, y + 8, 4, 1, '#ffb060'); R(x + 6, y + 10, 4, 1, '#f8f0e0');
      }
    }
  }

  // ---- continuous organic track surface: soft-edged dirt, then mud/water blended on top ----
  const dirtMask = _tileMask(track, ch => DRIVABLE[ch], 3);
  const dirtFill = _paintSurface(rnd, C.dirtBase, C.dirtDark, C.dirtLight, 260);
  dirtFill.getContext('2d').globalCompositeOperation = 'destination-in';
  dirtFill.getContext('2d').drawImage(dirtMask, 0, 0);
  g.drawImage(dirtFill, 0, 0);

  const hasMud = track.grid.some(row => row.includes('M'));
  if (hasMud) {
    const mudMask = _tileMask(track, ch => ch === 'M', 2.5);
    const mudFill = _paintSurface(rnd, C.mudBase, C.mudDark, C.mudLight, 90);
    mudFill.getContext('2d').globalCompositeOperation = 'destination-in';
    mudFill.getContext('2d').drawImage(mudMask, 0, 0);
    g.drawImage(mudFill, 0, 0);
  }
  const hasWater = track.grid.some(row => row.includes('W'));
  if (hasWater) {
    const waterMask = _tileMask(track, ch => ch === 'W', 2.5);
    const waterFill = U.mkCanvas(TRK.W, TRK.H);
    const wg = waterFill.getContext('2d');
    wg.fillStyle = C.waterBase; wg.fillRect(0, 0, TRK.W, TRK.H);
    for (let i = 0; i < 60; i++) { wg.fillStyle = C.waterDark; wg.fillRect(rnd() * TRK.W | 0, rnd() * TRK.H | 0, 5, 2); }
    wg.globalCompositeOperation = 'destination-in';
    wg.drawImage(waterMask, 0, 0);
    g.drawImage(waterFill, 0, 0);
    for (let ty = 0; ty < TRK.ROWS; ty++) for (let tx = 0; tx < TRK.COLS; tx++) {
      if (track.grid[ty][tx] !== 'W') continue;
      const x = tx * 16, y = ty * 16;
      g.strokeStyle = C.waterGlint; g.lineWidth = 1; g.globalAlpha = 0.75;
      g.beginPath(); g.moveTo(x + 1, y + 4 + (rnd() * 6 | 0)); g.lineTo(x + 15, y + 2 + (rnd() * 6 | 0)); g.stroke();
      g.globalAlpha = 1;
      if (track.theme === 'winter') {
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.beginPath(); g.moveTo(x + (rnd() * 8 | 0), y + (rnd() * 16 | 0));
        g.lineTo(x + 8 + (rnd() * 8 | 0), y + (rnd() * 16 | 0)); g.stroke();
      }
      track.waterTiles.push([x, y]);
    }
  }

  // ---- discrete surface objects on top: pebbles, tire marks, moguls, start checker ----
  for (let ty = 0; ty < TRK.ROWS; ty++) for (let tx = 0; tx < TRK.COLS; tx++) {
    const ch = track.grid[ty][tx];
    const x = tx * 16, y = ty * 16;
    if (ch === '.' || ch === 'S' || ch === 'J') {
      if (rnd() < 0.14) { const rx = x + (rnd() * 12 | 0), ry = y + (rnd() * 12 | 0); R(rx, ry, 2, 2, C.pebble); R(rx, ry, 1, 1, SPR._mix(C.pebble, '#ffffff', 0.4)); }
      if (rnd() < 0.07) {
        g.strokeStyle = 'rgba(40,26,14,0.16)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x + (rnd() * 6 | 0), y); g.quadraticCurveTo(x + 8, y + 8, x + (rnd() * 6 | 0) + 8, y + 16); g.stroke();
      }
      if (ch === 'J') { // big raised mound — bigger and more dramatic than a simple bump
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + 9, y + 11, 7, 4, 0, 0, U.TAU); g.fill();
        g.fillStyle = C.mogulLo; g.beginPath(); g.arc(x + 8, y + 9, 6.5, 0, U.TAU); g.fill();
        g.fillStyle = C.mogulMid; g.beginPath(); g.arc(x + 7.5, y + 8, 5, 0, U.TAU); g.fill();
        g.fillStyle = C.mogulHi; g.beginPath(); g.arc(x + 6, y + 6.5, 3.2, 0, U.TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(x + 4.8, y + 5.3, 1.2, 0, U.TAU); g.fill();
      }
      if (ch === 'S') {
        for (let sy = 0; sy < 16; sy += 4) for (let sx = 0; sx < 16; sx += 4)
          R(x + sx, y + sy, 4, 4, (((sx + sy) / 4) & 1) ? '#e8e8e8' : '#181818');
      }
    } else if (ch === 'M') {
      g.strokeStyle = 'rgba(230,200,150,0.28)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + 2, y + 3 + (rnd() * 3 | 0)); g.lineTo(x + 13, y + 1 + (rnd() * 3 | 0)); g.stroke();
      if (rnd() < 0.2) { g.strokeStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.arc(x + 4 + (rnd() * 8 | 0), y + 4 + (rnd() * 8 | 0), 2 + rnd() * 2, 0, U.TAU); g.stroke(); }
    }
  }

  // ---- track-edge candy-striped tube rail — follows the actual carved corridor, not a fixed rectangle ----
  for (let ty = 0; ty < TRK.ROWS; ty++) for (let tx = 0; tx < TRK.COLS; tx++) {
    if (!DRIVABLE[track.grid[ty][tx]]) continue;
    const x = tx * 16, y = ty * 16;
    const stripe = ((tx + ty) & 1) ? C.railB : C.railA, stripeDk = ((tx + ty) & 1) ? C.railBDk : C.railADk;
    const isRail = (nx, ny) => nx >= 0 && ny >= 0 && nx < TRK.COLS && ny < TRK.ROWS && !DRIVABLE[track.grid[ny][nx]] && track.grid[ny][nx] !== '#' && track.grid[ny][nx] !== 'G';
    if (isRail(tx, ty - 1)) { R(x, y, 16, 4, stripe); R(x, y, 16, 1, 'rgba(255,255,255,0.55)'); R(x, y + 3, 16, 1, stripeDk); }
    if (isRail(tx, ty + 1)) { R(x, y + 12, 16, 4, stripe); R(x, y + 12, 16, 1, 'rgba(255,255,255,0.55)'); R(x, y + 15, 16, 1, stripeDk); }
    if (isRail(tx - 1, ty)) { R(x, y, 4, 16, stripe); R(x, y, 1, 16, 'rgba(255,255,255,0.55)'); R(x + 3, y, 1, 16, stripeDk); }
    if (isRail(tx + 1, ty)) { R(x + 12, y, 4, 16, stripe); R(x + 12, y, 1, 16, 'rgba(255,255,255,0.55)'); R(x + 15, y, 1, 16, stripeDk); }
  }

  // tire ruts along the racing line
  g.save();
  g.beginPath();
  const wps = track.wps;
  g.moveTo(wps[0][0], wps[0][1]);
  for (let i = 1; i <= wps.length; i++) {
    const p = wps[i % wps.length];
    g.lineTo(p[0], p[1]);
  }
  g.closePath();
  g.lineJoin = 'round';
  g.strokeStyle = C.rut1; g.lineWidth = 12; g.stroke();
  g.strokeStyle = C.rut2; g.lineWidth = 4; g.stroke();
  g.restore();

  // baked relief shading: sample the SAME height field the 3D ground displaces with,
  // and light every slope from the north-west — ridge crests get bright warm light,
  // flanks and gullies fall into shadow. This painted light is what makes the whole
  // playfield read as sculpted dirt instead of a flat colored diagram.
  const hf = TRK.mkHeightField(track);
  for (let y = 48; y < TRK.H - 48; y += 4) for (let x = 48; x < TRK.W - 48; x += 4) {
    const ch = track.grid[y >> 4][x >> 4];
    if (ch === 'G' || ch === '#') continue;
    const h = hf(x, y);
    const b = U.clamp((-(hf(x + 4, y) - h) - (hf(x, y + 4) - h)) * 0.10, -0.5, 0.5);
    if (b > 0.02) { g.fillStyle = `rgba(255,212,150,${(b * 0.5).toFixed(2)})`; g.fillRect(x, y, 4, 4); }
    else if (b < -0.02) { g.fillStyle = `rgba(28,12,4,${(-b * 0.66).toFixed(2)})`; g.fillRect(x, y, 4, 4); }
  }

  // stadium roofline canopy along the very outer edge — angled fascia + support posts
  const roofCol1 = '#2a2830', roofCol2 = '#38343e';
  for (let tx = 0; tx < TRK.COLS; tx++) {
    for (const wy of [0, TRK.ROWS - 1]) {
      const x = tx * 16, y = wy * 16;
      const flip = wy === 0;
      R(x, flip ? y : y + 12, 16, 4, (tx & 1) ? roofCol1 : roofCol2);
      g.fillStyle = '#e8c020';
      g.beginPath();
      if (flip) { g.moveTo(x, y + 4); g.lineTo(x + 8, y + 8); g.lineTo(x + 16, y + 4); g.lineTo(x + 16, y + 6); g.lineTo(x + 8, y + 10); g.lineTo(x, y + 6); }
      else { g.moveTo(x, y + 12); g.lineTo(x + 8, y + 8); g.lineTo(x + 16, y + 12); g.lineTo(x + 16, y + 10); g.lineTo(x + 8, y + 6); g.lineTo(x, y + 10); }
      g.closePath(); g.fill();
      if (tx % 4 === 0) R(x + 7, flip ? y : y + 12, 2, 4, '#141218'); // support post
    }
  }
  for (let ty = 0; ty < TRK.ROWS; ty++) {
    for (const wx of [0, TRK.COLS - 1]) {
      const x = wx * 16, y = ty * 16, flip = wx === 0;
      R(flip ? x : x + 12, y, 4, 16, (ty & 1) ? roofCol1 : roofCol2);
      if (ty % 4 === 0) R(flip ? x : x + 12, y + 7, 4, 2, '#141218');
    }
  }

  // billboards on top & bottom walls
  let bb = seed % TRK.BILLBOARDS.length;
  for (const wy of [2, 27]) {
    for (let wx = 4; wx <= 24; wx += 8) {
      const x = wx * 16, y = wy * 16;
      R(x, y + 2, 46, 12, '#181820');
      R(x + 1, y + 3, 44, 10, '#ece8dc');
      const txt = TRK.BILLBOARDS[bb++ % TRK.BILLBOARDS.length];
      U.text(g, txt, x + 23, y + 5, { align: 'center', color: '#28304a' });
    }
  }

  if (track.theme === 'night') {
    // dusk multiply, then floodlight pools from the four light towers
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgb(88,92,148)';
    g.fillRect(0, 0, TRK.W, TRK.H);
    g.globalCompositeOperation = 'lighter';
    for (const [lx, ly] of [[80, 80], [432, 80], [80, 400], [432, 400]]) {
      const grad = g.createRadialGradient(lx, ly, 15, lx, ly, 160);
      grad.addColorStop(0, 'rgba(255,240,190,0.26)');
      grad.addColorStop(1, 'rgba(255,240,190,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(lx, ly, 160, 0, U.TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // light tower heads
    for (const [lx, ly] of [[80, 80], [432, 80], [80, 400], [432, 400]]) {
      g.fillStyle = '#181820'; g.fillRect(lx - 7, ly - 5, 14, 8);
      g.fillStyle = '#fff4c8';
      for (let i = 0; i < 3; i++) g.fillRect(lx - 5 + i * 4, ly - 3, 3, 4);
    }
  }
  return c;
};
