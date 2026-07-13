// MUD KINGS — util.js : math helpers, seeded RNG, bitmap pixel font
'use strict';

const U = {};

// ---------- math ----------
U.clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
U.lerp = (a, b, t) => a + (b - a) * t;
U.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
U.TAU = Math.PI * 2;

// smallest signed angle from a to b, in (-PI, PI]
U.angDiff = (a, b) => {
  let d = (b - a) % U.TAU;
  if (d > Math.PI) d -= U.TAU;
  if (d < -Math.PI) d += U.TAU;
  return d;
};

// seeded RNG (mulberry32)
U.rng = (seed) => {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

U.mkCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return c;
};

U.fmtMoney = (n) => '$' + (n | 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---------- 3x5 bitmap font ----------
// Variable width glyphs; 'X' = pixel on. Height is always 5.
const FONT = {
  'A': ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  'B': ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'],
  'C': ['.XX', 'X..', 'X..', 'X..', '.XX'],
  'D': ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'],
  'E': ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
  'F': ['XXX', 'X..', 'XX.', 'X..', 'X..'],
  'G': ['.XX', 'X..', 'X.X', 'X.X', '.XX'],
  'H': ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'],
  'I': ['XXX', '.X.', '.X.', '.X.', 'XXX'],
  'J': ['..X', '..X', '..X', 'X.X', '.X.'],
  'K': ['X.X', 'X.X', 'XX.', 'X.X', 'X.X'],
  'L': ['X..', 'X..', 'X..', 'X..', 'XXX'],
  'M': ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'],
  'N': ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'],
  'O': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  'P': ['XX.', 'X.X', 'XX.', 'X..', 'X..'],
  'Q': ['XXX', 'X.X', 'X.X', 'XXX', '..X'],
  'R': ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'],
  'S': ['.XX', 'X..', '.X.', '..X', 'XX.'],
  'T': ['XXX', '.X.', '.X.', '.X.', '.X.'],
  'U': ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'],
  'V': ['X.X', 'X.X', 'X.X', 'X.X', '.X.'],
  'W': ['X...X', 'X...X', 'X.X.X', 'XX.XX', 'X...X'],
  'X': ['X.X', 'X.X', '.X.', 'X.X', 'X.X'],
  'Y': ['X.X', 'X.X', '.X.', '.X.', '.X.'],
  'Z': ['XXX', '..X', '.X.', 'X..', 'XXX'],
  '0': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  '1': ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
  '2': ['XX.', '..X', '.X.', 'X..', 'XXX'],
  '3': ['XXX', '..X', '.XX', '..X', 'XXX'],
  '4': ['X.X', 'X.X', 'XXX', '..X', '..X'],
  '5': ['XXX', 'X..', 'XX.', '..X', 'XX.'],
  '6': ['.XX', 'X..', 'XXX', 'X.X', 'XXX'],
  '7': ['XXX', '..X', '.X.', '.X.', '.X.'],
  '8': ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
  '9': ['XXX', 'X.X', 'XXX', '..X', 'XX.'],
  '$': ['.XX', 'XX.', '.X.', '.XX', 'XX.'],
  '.': ['.', '.', '.', '.', 'X'],
  ',': ['.', '.', '.', 'X', 'X'],
  ':': ['.', 'X', '.', 'X', '.'],
  '!': ['X', 'X', 'X', '.', 'X'],
  '-': ['...', '...', 'XXX', '...', '...'],
  '+': ['...', '.X.', 'XXX', '.X.', '...'],
  '/': ['..X', '..X', '.X.', 'X..', 'X..'],
  "'": ['X', 'X', '.', '.', '.'],
  '?': ['XX.', '..X', '.X.', '...', '.X.'],
  '%': ['X.X', '..X', '.X.', 'X..', 'X.X'],
  '(': ['.X', 'X.', 'X.', 'X.', '.X'],
  ')': ['X.', '.X', '.X', '.X', 'X.'],
  ' ': ['..', '..', '..', '..', '..'],
};

// draw text; opts: {scale, color, align ('left'|'center'|'right'), outline, alpha}
U.textW = (str, scale = 1) => {
  let w = 0;
  for (const ch of String(str).toUpperCase()) {
    const g = FONT[ch] || FONT['?'];
    w += (g[0].length + 1) * scale;
  }
  return Math.max(0, w - scale);
};

U.text = (ctx, str, x, y, opts = {}) => {
  const s = opts.scale || 1;
  const col = opts.color || '#fff';
  str = String(str).toUpperCase();
  let px = x;
  if (opts.align === 'center') px = x - (U.textW(str, s) >> 1);
  else if (opts.align === 'right') px = x - U.textW(str, s);
  if (opts.alpha !== undefined) { ctx.save(); ctx.globalAlpha = opts.alpha; }
  // outline pass
  if (opts.outline) {
    ctx.fillStyle = opts.outline;
    let ox = px;
    for (const ch of str) {
      const g = FONT[ch] || FONT['?'];
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < g[r].length; c++)
          if (g[r][c] === 'X')
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++)
                ctx.fillRect(ox + c * s + dx, y + r * s + dy, s, s);
      ox += (g[0].length + 1) * s;
    }
  }
  ctx.fillStyle = col;
  for (const ch of str) {
    const g = FONT[ch] || FONT['?'];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < g[r].length; c++)
        if (g[r][c] === 'X') ctx.fillRect(px + c * s, y + r * s, s, s);
    px += (g[0].length + 1) * s;
  }
  if (opts.alpha !== undefined) ctx.restore();
};
