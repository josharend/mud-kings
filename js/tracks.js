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
const _block = (g, x0, y0, x1, y1) => { // tire-wall rimmed infield block
  _rect(g, x0, y0, x1, y1, 'T');
  if (x1 - x0 > 1 && y1 - y0 > 1) _rect(g, x0 + 1, y0 + 1, x1 - 1, y1 - 1, ',');
};

// ---------- track definitions ----------
// wps/slots/pickups in tile units (1 unit = 16px)
TRK.defs = [
  {
    name: 'DUST BOWL',
    build: (g) => {
      _rect(g, 3, 4, 28, 25, '.');
      _block(g, 10, 10, 21, 19);
      _rect(g, 12, 5, 19, 7, 'J');
      _rect(g, 3, 13, 6, 16, 'M');
      _rect(g, 15, 20, 16, 25, 'S');
    },
    wps: [[20, 22.5], [25.5, 21], [25.5, 14], [25.5, 8.5], [21, 6.5], [15.5, 6.5],
          [10, 6.5], [6.5, 8.5], [7.5, 14], [6.5, 19], [8.5, 22.5], [12.5, 22.5]],
    slots: [[13.5, 21.3], [12, 22.3], [13.5, 23.3], [12, 24.3]],
    startDir: 0,
    pickups: [{ x: 21.5, y: 5, k: 'nitro' }, { x: 4.5, y: 14.5, k: 'money' },
              { x: 25.5, y: 17, k: 'money' }],
  },
  {
    name: 'THE HOURGLASS',
    build: (g) => {
      _rect(g, 3, 4, 28, 25, '.');
      _block(g, 3, 12, 11, 17);
      _block(g, 20, 12, 28, 17);
      _rect(g, 11, 4, 20, 6, 'J');
      _rect(g, 13, 21, 18, 23, 'M');
      _rect(g, 13, 14, 18, 15, 'W');
      _rect(g, 12, 18, 13, 25, 'S');
    },
    wps: [[16, 19.5], [21.5, 20.5], [25.5, 20], [21, 18.8], [17.5, 16.5], [17, 12.5],
          [20, 10.3], [24, 8.6], [25.5, 6.2], [16, 5], [6.5, 6.2], [6, 8.6],
          [9, 10.5], [14.5, 12.5], [14.5, 16.5], [11, 18.8], [6.5, 20.3], [9, 21.8]],
    slots: [[10.5, 19.5], [9, 20.5], [10.5, 21.5], [9, 22.5]],
    startDir: 0,
    pickups: [{ x: 16, y: 14.8, k: 'nitro' }, { x: 15.5, y: 22, k: 'money' },
              { x: 5.5, y: 5.5, k: 'money' }],
  },
  {
    name: 'SPLASHDOWN',
    build: (g) => {
      _rect(g, 3, 4, 28, 25, '.');
      _block(g, 10, 10, 21, 19);
      _rect(g, 23, 12, 26, 14, 'W');
      _rect(g, 13, 4, 17, 6, 'W');
      _rect(g, 4, 20, 8, 24, 'M');
      _rect(g, 4, 11, 7, 14, 'J');
      _rect(g, 15, 20, 16, 25, 'S');
    },
    wps: [[20, 22.5], [25, 22], [27.5, 19], [27.5, 13], [26, 8.5], [21, 6.5],
          [17.5, 7.8], [13, 7.8], [9.5, 6.5], [6.5, 8.5], [5.5, 12.5], [6, 16],
          [6.5, 18.5], [9.5, 21.5], [12.5, 22.5]],
    slots: [[13.5, 21.3], [12, 22.3], [13.5, 23.3], [12, 24.3]],
    startDir: 0,
    pickups: [{ x: 15, y: 5, k: 'nitro' }, { x: 24.5, y: 13, k: 'money' },
              { x: 6, y: 22, k: 'money' }],
  },
  {
    name: 'HAIRPIN HAVOC',
    build: (g) => {
      _rect(g, 3, 4, 28, 25, '.');
      _block(g, 9, 10, 22, 16);
      _rect(g, 15, 20, 16, 25, 'T');
      _rect(g, 11, 5, 20, 7, 'J');
      _rect(g, 3, 12, 6, 15, 'M');
      _rect(g, 19, 21, 22, 24, 'W');
      _rect(g, 10, 19, 11, 25, 'S');
    },
    wps: [[13, 20.5], [13.8, 18.2], [15.5, 17.6], [17.3, 18.4], [18.5, 20.3],
          [21, 19.6], [24, 20.2], [26.3, 21.5], [26.3, 17], [26.3, 11], [25.5, 7],
          [21.5, 6.2], [15.5, 6.2], [9.5, 6.4], [6.3, 8.5], [7.5, 13.5], [7, 16.5],
          [6.3, 19], [6.5, 21.5], [9.5, 22]],
    slots: [[8, 19.8], [6.5, 20.8], [8, 21.8], [6.5, 22.8]],
    startDir: 0,
    pickups: [{ x: 15.5, y: 17.5, k: 'nitro' }, { x: 20.5, y: 22.5, k: 'money' },
              { x: 4.5, y: 13.5, k: 'money' }],
  },
  {
    name: 'THE COLOSSEUM',
    build: (g) => {
      _rect(g, 3, 4, 28, 25, '.');
      _block(g, 9, 9, 22, 18);
      _rect(g, 11, 5, 20, 6, 'J');
      _rect(g, 3, 12, 4, 16, 'M');
      _rect(g, 24, 11, 27, 13, 'W');
      _rect(g, 14, 19, 16, 25, 'S');
    },
    wps: [[20, 21.5], [25.5, 20], [26, 14], [25.5, 8], [22, 6.5], [16, 6.3],
          [9, 6.5], [5.8, 8], [5.5, 14], [6, 20], [10, 22], [16, 22.3]],
    slots: [[15.5, 20.5], [14, 21.5], [15.5, 22.5], [14, 23.5]],
    startDir: 0,
    pickups: [{ x: 15.5, y: 5.5, k: 'nitro' }, { x: 3.5, y: 14, k: 'money' },
              { x: 25.5, y: 12, k: 'money' }],
  },
  {
    name: 'SIDEWINDER',
    build: (g) => {
      _rect(g, 3, 4, 28, 25, '.');
      _block(g, 6, 8, 14, 13);
      _block(g, 17, 16, 25, 20);
      _rect(g, 19, 22, 21, 23, 'M');
      _rect(g, 14, 5, 16, 6, 'W');
      _rect(g, 26, 11, 27, 13, 'J');
      _rect(g, 6, 20, 8, 25, 'S');
    },
    wps: [[13, 22.5], [20, 22.5], [25, 22], [27.5, 17], [27, 10], [23, 6.5],
          [16, 5.5], [9, 5.5], [4.5, 9], [4.5, 15], [5, 20], [8.5, 23]],
    slots: [[8, 21.5], [6.5, 22.5], [8, 23.5], [6.5, 24.5]],
    startDir: 0,
    pickups: [{ x: 23, y: 7, k: 'nitro' }, { x: 4, y: 15, k: 'money' },
              { x: 27, y: 17, k: 'money' }],
  },
  {
    name: 'THE GAUNTLET',
    build: (g) => {
      _rect(g, 3, 4, 28, 25, '.');
      _block(g, 7, 11, 24, 16);
      _rect(g, 10, 5, 20, 7, 'J');
      _rect(g, 9, 18, 13, 20, 'W');
      _rect(g, 24, 8, 26, 10, 'M');
      _rect(g, 8, 19, 10, 25, 'S');
    },
    wps: [[14, 21], [20, 21], [25, 20], [27, 15], [26.5, 9], [22, 7.5],
          [14, 7.5], [8, 8], [4.5, 13], [5, 18], [8, 20.5], [11, 21.3]],
    slots: [[10, 20], [8.5, 21], [10, 22], [8.5, 23]],
    startDir: 0,
    pickups: [{ x: 15, y: 6, k: 'nitro' }, { x: 11, y: 19, k: 'money' },
              { x: 25, y: 9, k: 'money' }],
  },
  {
    name: 'THE HOOK',
    build: (g) => {
      _rect(g, 3, 4, 28, 25, '.');
      _block(g, 8, 8, 16, 13);
      _block(g, 8, 8, 12, 20);
      _rect(g, 13, 15, 16, 19, 'W');
      _rect(g, 18, 8, 23, 10, 'J');
      _rect(g, 3, 15, 4, 18, 'M');
      _rect(g, 14, 21, 16, 25, 'S');
    },
    wps: [[20, 22], [25, 21], [26.5, 14], [24, 6.5], [17, 5.5], [10, 6],
          [5.5, 7.5], [5, 13], [5, 19], [9, 22.5], [15, 23]],
    slots: [[15.5, 21.5], [14, 22.5], [15.5, 23.5], [14, 24.5]],
    startDir: 0,
    pickups: [{ x: 20.5, y: 9, k: 'nitro' }, { x: 3.5, y: 16.5, k: 'money' },
              { x: 14.5, y: 17, k: 'money' }],
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
