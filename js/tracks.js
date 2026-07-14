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
// 2x2 grid of start slots, tucked behind p0 along the reverse of the p0->p1 direction
const _mkSlots = (p0, p1) => {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const d = Math.hypot(dx, dy) || 1;
  const fx = dx / d, fy = dy / d, px = -fy, py = fx;
  const slots = [];
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    const back = 1.3 + row * 1.4, off = (col - 0.5) * 1.7;
    slots.push([p0[0] - fx * back + px * off, p0[1] - fy * back + py * off]);
  }
  return slots;
};

// ---------- track centerlines (tile units) ----------
// Each is a closed loop: point[i] connects to point[i+1], wrapping last-to-first.
// Grid discipline: turn columns/rows are always >=5 tiles apart so corridors (halfWidth
// 1.4-2.2) never bleed into each other. This is what replaced the old "wide ring around
// one island" tracks with real winding, narrow, technical circuits.
const PATH_DUSTBOWL  = [[8, 23], [8, 18], [18, 18], [18, 12], [8, 12], [8, 7], [18, 7], [25, 7], [25, 23]];
const PATH_HOURGLASS = [[8, 22], [8, 7], [13, 7], [13, 22], [18, 22], [18, 7], [23, 7], [23, 22]];
const PATH_SPLASHDOWN = [[8, 7], [8, 12], [18, 12], [18, 18], [8, 18], [8, 23], [18, 23], [25, 23], [25, 7]];
const PATH_HAIRPIN   = [[8, 23], [8, 19], [18, 19], [18, 15], [8, 15], [8, 11], [18, 11], [18, 7], [25, 7], [25, 23]];
const PATH_COLOSSEUM = [[8, 23], [8, 7], [25, 7], [25, 15], [14, 15], [14, 23]];
const PATH_SIDEWINDER = [[23, 22], [23, 7], [18, 7], [18, 22], [13, 22], [13, 7], [8, 7], [8, 22]];
const PATH_GAUNTLET  = [[23, 23], [23, 7], [13, 7], [13, 18], [7, 18], [7, 23]];
const PATH_HOOK       = [[8, 22], [8, 7], [23, 7], [23, 22], [18, 22], [18, 17], [13, 17], [13, 22]];

// ---------- track definitions ----------
// wps/slots/pickups in tile units (1 unit = 16px)
TRK.defs = [
  {
    name: 'DUST BOWL',
    build: (g) => {
      _carvePath(g, PATH_DUSTBOWL, 1.8, '.', 0.8);
      _rect(g, 12, 12, 15, 18, 'M');       // shortcut: mud connector cutting the row12<->row18 turn
      _rect(g, 14, 17, 17, 18, 'J');       // moguls launch you into the column-18 turn
      _rect(g, 10, 7, 13, 8, 'M');
      _startPatch(g, PATH_DUSTBOWL[0]);
    },
    wps: PATH_DUSTBOWL,
    slots: _mkSlots(PATH_DUSTBOWL[0], PATH_DUSTBOWL[1]),
    startDir: _startDir(PATH_DUSTBOWL[0], PATH_DUSTBOWL[1]),
    pickups: [{ x: 13, y: 15, k: 'nitro' }, { x: 21, y: 8, k: 'money' }, { x: 5, y: 15, k: 'money' }],
  },
  {
    name: 'THE HOURGLASS',
    build: (g) => {
      _carvePath(g, PATH_HOURGLASS, 1.8, '.', 0.8);
      _rect(g, 12, 13, 14, 16, 'M');       // the pinch: mud waist in the middle column
      _rect(g, 17, 10, 19, 12, 'W');
      _rect(g, 7, 14, 9, 16, 'J');          // mid-pass, clear of the turn vertices
      _startPatch(g, PATH_HOURGLASS[0]);
    },
    wps: PATH_HOURGLASS,
    slots: _mkSlots(PATH_HOURGLASS[0], PATH_HOURGLASS[1]),
    startDir: _startDir(PATH_HOURGLASS[0], PATH_HOURGLASS[1]),
    pickups: [{ x: 13, y: 14, k: 'nitro' }, { x: 8, y: 15, k: 'money' }, { x: 23, y: 15, k: 'money' }],
  },
  {
    name: 'SPLASHDOWN',
    build: (g) => {
      _carvePath(g, PATH_SPLASHDOWN, 1.8, '.', 0.8);
      _rect(g, 11, 12, 14, 13, 'W');
      _rect(g, 11, 18, 14, 19, 'W');
      _rect(g, 20, 23, 23, 24, 'M');
      _rect(g, 9, 7, 12, 8, 'J');
      _startPatch(g, PATH_SPLASHDOWN[0]);
    },
    wps: PATH_SPLASHDOWN,
    slots: _mkSlots(PATH_SPLASHDOWN[0], PATH_SPLASHDOWN[1]),
    startDir: _startDir(PATH_SPLASHDOWN[0], PATH_SPLASHDOWN[1]),
    pickups: [{ x: 16, y: 12, k: 'nitro' }, { x: 16, y: 18, k: 'money' }, { x: 22, y: 7, k: 'money' }],
  },
  {
    name: 'HAIRPIN HAVOC',
    build: (g) => {
      _carvePath(g, PATH_HAIRPIN, 1.4, '.', 0.9);   // narrowest track — deliberately the most technical
      _rect(g, 12, 15, 14, 16, 'M');        // mid-pass, clear of the turn vertices
      _rect(g, 11, 10, 13, 11, 'J');        // mid-pass, clear of the turn vertices
      _startPatch(g, PATH_HAIRPIN[0]);
    },
    wps: PATH_HAIRPIN,
    slots: _mkSlots(PATH_HAIRPIN[0], PATH_HAIRPIN[1]),
    startDir: _startDir(PATH_HAIRPIN[0], PATH_HAIRPIN[1]),
    pickups: [{ x: 13, y: 19, k: 'nitro' }, { x: 13, y: 7, k: 'money' }, { x: 25, y: 15, k: 'money' }],
  },
  {
    name: 'THE COLOSSEUM',
    build: (g) => {
      _carvePath(g, PATH_COLOSSEUM, 2.2, '.', 1.0);  // widest track — the grand sweeping one
      _rect(g, 12, 7, 20, 8, 'J');
      _rect(g, 20, 14, 23, 16, 'W');
      _rect(g, 10, 22, 13, 23, 'M');
      _startPatch(g, PATH_COLOSSEUM[0]);
    },
    wps: PATH_COLOSSEUM,
    slots: _mkSlots(PATH_COLOSSEUM[0], PATH_COLOSSEUM[1]),
    startDir: _startDir(PATH_COLOSSEUM[0], PATH_COLOSSEUM[1]),
    pickups: [{ x: 16, y: 7, k: 'nitro' }, { x: 8, y: 15, k: 'money' }, { x: 22, y: 15, k: 'money' }],
  },
  {
    name: 'SIDEWINDER',
    build: (g) => {
      _carvePath(g, PATH_SIDEWINDER, 1.8, '.', 0.8);
      _rect(g, 17, 13, 19, 16, 'M');
      _rect(g, 12, 13, 14, 16, 'J');        // mid-pass, clear of the turn vertices
      _rect(g, 7, 13, 9, 16, 'W');
      _startPatch(g, PATH_SIDEWINDER[0]);
    },
    wps: PATH_SIDEWINDER,
    slots: _mkSlots(PATH_SIDEWINDER[0], PATH_SIDEWINDER[1]),
    startDir: _startDir(PATH_SIDEWINDER[0], PATH_SIDEWINDER[1]),
    pickups: [{ x: 18, y: 14, k: 'nitro' }, { x: 23, y: 14, k: 'money' }, { x: 8, y: 14, k: 'money' }],
  },
  {
    name: 'THE GAUNTLET',
    build: (g) => {
      _carvePath(g, PATH_GAUNTLET, 1.8, '.', 0.8);
      _rect(g, 22, 12, 24, 14, 'M');
      _rect(g, 11, 10, 14, 11, 'J');
      _rect(g, 6, 20, 9, 22, 'W');
      _rect(g, 17, 18, 20, 19, 'M');
      _startPatch(g, PATH_GAUNTLET[0]);
    },
    wps: PATH_GAUNTLET,
    slots: _mkSlots(PATH_GAUNTLET[0], PATH_GAUNTLET[1]),
    startDir: _startDir(PATH_GAUNTLET[0], PATH_GAUNTLET[1]),
    pickups: [{ x: 23, y: 16, k: 'nitro' }, { x: 13, y: 12, k: 'money' }, { x: 7, y: 20, k: 'money' }],
  },
  {
    name: 'THE HOOK',
    build: (g) => {
      _carvePath(g, PATH_HOOK, 1.8, '.', 0.8);
      _rect(g, 12, 7, 20, 8, 'J');
      _rect(g, 14, 17, 17, 18, 'M');
      _rect(g, 7, 14, 9, 16, 'W');
      _startPatch(g, PATH_HOOK[0]);
    },
    wps: PATH_HOOK,
    slots: _mkSlots(PATH_HOOK[0], PATH_HOOK[1]),
    startDir: _startDir(PATH_HOOK[0], PATH_HOOK[1]),
    pickups: [{ x: 15, y: 17, k: 'nitro' }, { x: 23, y: 14, k: 'money' }, { x: 8, y: 18, k: 'money' }],
  },
];

TRK.BILLBOARDS = ['MUD KING COLA', 'NITRO+', "JOSH'S GARAGE", 'TIRE TOWN',
                  'BIG AIR SODA', '4X4 4EVER', 'ROAR FM 98.9', 'DIRT WAX'];

// season race themes (one per base track); winter turns water tiles into slippery ice
// 0 DustBowl 1 Hourglass 2 Splashdown 3 Hairpin 4 Colosseum 5 Sidewinder 6 Gauntlet 7 Hook
TRK.THEME_CYCLE = ['day', 'day', 'winter', 'night', 'day', 'night', 'winter', 'night'];

TRK.THEMES = {
  day: {
    dirt: (j) => `rgb(${192 + j},${138 + j},${82 + j})`,
    dSpeck1: '#a06f3c', dSpeck2: '#d4a06a', pebble: '#8a6a48',
    grass: '#4e7a38', gSpeck1: '#62924a', gSpeck2: '#3f6329',
    waterBase: '#3f6f9e', waterDark: '#35608c', waterGlint: '#7fa8d0', waterRim: '#b89060',
    mogulHi: '#dca86b', mogulLo: '#8a5a33', mogulMid: '#c89058',
    rut1: 'rgba(96,58,30,0.20)', rut2: 'rgba(70,42,22,0.20)',
    glintCol: 'rgba(180,215,245,0.7)',
  },
  winter: {
    dirt: (j) => `rgb(${218 + j},${224 + j},${231 + j})`,
    dSpeck1: '#b0bcc8', dSpeck2: '#f2f7fb', pebble: '#8a949e',
    grass: '#c2cfd8', gSpeck1: '#dde7ee', gSpeck2: '#a4b2bc',
    waterBase: '#a8cce0', waterDark: '#8fb8d0', waterGlint: '#eef8ff', waterRim: '#7fa0b8',
    mogulHi: '#f2f7fb', mogulLo: '#93a4b4', mogulMid: '#ccdae4',
    rut1: 'rgba(120,95,70,0.22)', rut2: 'rgba(96,74,52,0.22)',
    glintCol: 'rgba(255,255,255,0.8)',
  },
};
TRK.THEMES.night = TRK.THEMES.day; // night = day colors + darkening pass

// ---------- track factory ----------
// season = one pass through all base tracks; subsequent seasons mirror + add hazards
TRK.make = (raceIdx) => {
  const N = TRK.defs.length;
  const defIdx = raceIdx % N;
  const mirrored = (Math.floor(raceIdx / N) % 2) === 1;
  const def = TRK.defs[defIdx];
  const grid = _mkGrid();
  def.build(grid);

  // extra scattered hazards on later visits
  const lapAround = Math.floor(raceIdx / N);
  if (lapAround > 0) {
    const rnd = U.rng(1000 + raceIdx * 77);
    let placed = 0, guard = 0;
    while (placed < 8 && guard++ < 400) {
      const x = 4 + ((rnd() * 24) | 0), y = 5 + ((rnd() * 20) | 0);
      if (grid[y][x] === '.') { grid[y][x] = rnd() < 0.55 ? 'M' : 'J'; placed++; }
    }
  }

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
TRK.render = (track, seed) => {
  const c = U.mkCanvas(TRK.W, TRK.H);
  const g = c.getContext('2d');
  const rnd = U.rng(4242 + seed * 13);
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const CROWD = ['#e04040', '#e8c040', '#40a0e0', '#40c080', '#e080c0', '#f0ece0', '#e08030', '#b0b8f0'];
  const C = TRK.THEMES[track.theme] || TRK.THEMES.day;

  for (let ty = 0; ty < TRK.ROWS; ty++) for (let tx = 0; tx < TRK.COLS; tx++) {
    const ch = track.grid[ty][tx];
    const x = tx * 16, y = ty * 16;
    if (ch === 'G') {
      R(x, y, 16, 16, '#565b63');
      for (let r = 0; r < 16; r += 4) R(x, y + r, 16, 1, '#43474e');
      const dots = 5 + (rnd() * 4 | 0);
      for (let i = 0; i < dots; i++) {
        const px = x + (rnd() * 14 | 0), py = y + 1 + (rnd() * 13 | 0);
        R(px, py, 2, 2, CROWD[rnd() * CROWD.length | 0]);
        if (rnd() < 0.35) track.crowdSpots.push([px, py]);
      }
    } else if (ch === '#') {
      const red = ((tx + ty) & 1) === 0;
      R(x, y, 16, 16, red ? '#c8342a' : '#e6e2d6');
      R(x, y, 16, 2, red ? '#e05a50' : '#f8f6ee');
      R(x, y + 14, 16, 2, red ? '#821a12' : '#a8a49a');
    } else if (ch === ',' || ch === 'T') {
      R(x, y, 16, 16, C.grass);
      for (let i = 0; i < 5; i++)
        R(x + (rnd() * 15 | 0), y + (rnd() * 15 | 0), 1, 1, rnd() < 0.5 ? C.gSpeck1 : C.gSpeck2);
      if (ch === 'T') {
        for (const ox of [4, 12]) {
          const jx = x + ox + (rnd() * 3 | 0) - 1, jy = y + 8 + (rnd() * 3 | 0) - 1;
          g.fillStyle = '#1e1e24'; g.beginPath(); g.arc(jx, jy, 4, 0, U.TAU); g.fill();
          g.fillStyle = '#34343c'; g.beginPath(); g.arc(jx, jy, 1.8, 0, U.TAU); g.fill();
        }
      } else if (rnd() < 0.05) {
        R(x + 4, y + 6, 7, 5, '#c8a860'); R(x + 4, y + 8, 7, 1, '#a8884a'); // hay bale
      } else if (rnd() < 0.04) {
        R(x + 6, y + 8, 4, 5, '#f08020'); R(x + 6, y + 10, 4, 1, '#f8f0e0'); // cone
      }
    } else if (ch === '.' || ch === 'S' || ch === 'J') {
      const j = (rnd() * 12 | 0) - 6;
      R(x, y, 16, 16, C.dirt(j));
      for (let i = 0; i < 6; i++)
        R(x + (rnd() * 15 | 0), y + (rnd() * 15 | 0), 1, 1, rnd() < 0.5 ? C.dSpeck1 : C.dSpeck2);
      if (rnd() < 0.12) R(x + (rnd() * 13 | 0), y + (rnd() * 13 | 0), 2, 1, C.pebble);
      if (ch === 'J') { // mogul bump
        g.fillStyle = C.mogulLo; g.beginPath(); g.arc(x + 9, y + 9, 5, 0, U.TAU); g.fill();
        g.fillStyle = C.mogulHi; g.beginPath(); g.arc(x + 7, y + 7, 4.5, 0, U.TAU); g.fill();
        g.fillStyle = C.mogulMid; g.beginPath(); g.arc(x + 8, y + 8, 3, 0, U.TAU); g.fill();
      }
      if (ch === 'S') {
        for (let sy = 0; sy < 16; sy += 4) for (let sx = 0; sx < 16; sx += 4)
          R(x + sx, y + sy, 4, 4, (((sx + sy) / 4) & 1) ? '#e8e8e8' : '#181818');
      }
    } else if (ch === 'M') {
      R(x, y, 16, 16, '#6b4426');
      for (let i = 0; i < 4; i++)
        R(x + (rnd() * 12 | 0), y + (rnd() * 12 | 0), 3 + (rnd() * 3 | 0), 2, '#55341c');
      for (let i = 0; i < 3; i++)
        R(x + (rnd() * 14 | 0), y + (rnd() * 14 | 0), 2, 1, '#8a5c34');
    } else if (ch === 'W') {
      R(x, y, 16, 16, C.waterBase);
      for (let i = 0; i < 3; i++)
        R(x + (rnd() * 11 | 0), y + (rnd() * 11 | 0), 4, 2, C.waterDark);
      R(x + (rnd() * 12 | 0), y + (rnd() * 12 | 0), 3, 1, C.waterGlint);
      if (track.theme === 'winter') { // crack lines in the ice
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.beginPath(); g.moveTo(x + (rnd() * 8 | 0), y + (rnd() * 16 | 0));
        g.lineTo(x + 8 + (rnd() * 8 | 0), y + (rnd() * 16 | 0)); g.stroke();
      }
      track.waterTiles.push([x, y]);
    }
  }

  // soft rims where mud/water meets dirt
  for (let ty = 1; ty < TRK.ROWS - 1; ty++) for (let tx = 1; tx < TRK.COLS - 1; tx++) {
    const ch = track.grid[ty][tx];
    if (ch !== 'M' && ch !== 'W') continue;
    const rim = ch === 'M' ? '#4a2c16' : C.waterRim;
    if (track.grid[ty - 1][tx] === '.') R(tx * 16, ty * 16, 16, 1, rim);
    if (track.grid[ty + 1][tx] === '.') R(tx * 16, ty * 16 + 15, 16, 1, rim);
    if (track.grid[ty][tx - 1] === '.') R(tx * 16, ty * 16, 1, 16, rim);
    if (track.grid[ty][tx + 1] === '.') R(tx * 16 + 1 * 15, ty * 16, 1, 16, rim);
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
