// MUD KINGS — sprites.js : procedural pixel-art sprites (trucks, flames, pickups)
'use strict';

const SPR = {
  PALETTES: [
    { name: 'BLUE',   body: '#2e6fd8', light: '#6aa4f0', dark: '#1d4a9a' },
    { name: 'RED',    body: '#d83a2e', light: '#f07a6a', dark: '#8e1f17' },
    { name: 'YELLOW', body: '#e8c020', light: '#f8e070', dark: '#a08010' },
    { name: 'PURPLE', body: '#9040c8', light: '#b878e8', dark: '#5c2884' },
  ],
  trucks: [],   // [palette][chassis][16] canvases 32x32
  flames: [],   // [16][2] canvases 48x48
  FRAME: 32,
  FLAME_FRAME: 48,
};

// chassis: stat mods are added on top of upgrade-level stats
SPR.CHASSIS = [
  { key: 'mudcat', name: 'MUDCAT', tag: 'ALL-ROUNDER',
    mods: { top: 0, accel: 0, turn: 0, grip: 0 },
    blurb: 'DOES EVERYTHING. COMPLAINS NEVER.' },
  { key: 'jackrabbit', name: 'JACKRABBIT', tag: 'SPEED DEMON',
    mods: { top: 12, accel: 18, turn: -0.35, grip: -0.5 },
    blurb: 'FASTEST THING ON DIRT. STEERS LIKE A RUMOR.' },
  { key: 'bulldog', name: 'BULLDOG', tag: 'CORNER KING',
    mods: { top: -10, accel: -12, turn: 0.3, grip: 0.6 },
    blurb: 'SLOW? SURE. EVER SEEN A BULLDOG SPIN OUT?' },
];

// heading (radians, 0 = +x, cw) -> sprite index. Base art faces up (-y).
SPR.headingIndex = (h) => {
  let i = Math.round((h + Math.PI / 2) / (Math.PI / 8));
  return ((i % 16) + 16) % 16;
};

SPR._drawTruckBase = (pal, chassis) => {
  const c = U.mkCanvas(26, 26);
  const g = c.getContext('2d');
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

  // tires (front 6x7, rear 6x8 — rears bigger, off-road style)
  const tire = (x, y, h) => {
    R(x, y, 6, h, '#14110e');
    R(x + 1, y + 1, 4, h - 2, '#2b2622');
    R(x + 2, y + Math.floor(h / 2) - 1, 2, 2, '#96a0a8'); // hub
  };
  tire(2, 3, 7); tire(18, 3, 7);    // front
  tire(2, 16, 8); tire(18, 16, 8);  // rear

  // chassis + body
  R(8, 2, 10, 23, pal.dark);          // under-chassis
  R(9, 1, 8, 1, '#494f55');           // front bumper
  R(8, 2, 10, 6, pal.body);           // hood
  R(12, 2, 2, 6, pal.light);          // racing stripe
  R(9, 8, 8, 3, '#1c2f4a');           // windshield
  R(10, 8, 2, 1, '#85aed6');          // glint
  R(9, 11, 8, 4, pal.body);           // cab roof
  R(9, 11, 8, 1, pal.light);          // roof highlight
  R(9, 15, 8, 1, '#c9ced2');          // roll bar
  R(8, 16, 10, 9, pal.dark);          // bed shell
  R(9, 17, 8, 7, '#241a10');          // bed interior
  R(11, 19, 4, 4, '#14110e');         // spare tire
  R(12, 20, 2, 2, '#4c5258');
  R(8, 2, 1, 13, pal.light);          // lit side (left)
  R(17, 2, 1, 13, pal.dark);          // shaded side (right)

  if (chassis === 1) {                // JACKRABBIT: rear spoiler + hood scoop
    R(6, 24, 14, 2, '#c9ced2');
    R(6, 22, 2, 2, '#494f55'); R(18, 22, 2, 2, '#494f55');
    R(11, 3, 4, 3, '#1c2f4a');
  } else if (chassis === 2) {         // BULLDOG: bull bar + amber roof lights
    R(7, 0, 12, 2, '#494f55');
    R(8, 0, 1, 3, '#3a3f44'); R(17, 0, 1, 3, '#3a3f44');
    for (const lx of [10, 12, 14, 16]) R(lx, 15, 1, 1, '#ffd040');
  }
  return c;
};

SPR.truck = (pal, chassis) => SPR.trucks[pal][chassis || 0];

// snap alpha to 0/255 and add a dark outline around opaque pixels
SPR._outline = (c) => {
  const g = c.getContext('2d');
  const w = c.width, h = c.height;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] >= 120) { d[i * 4 + 3] = 255; solid[i] = 1; }
    else d[i * 4 + 3] = 0;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (solid[i]) continue;
    const near = (x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) ||
                 (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w]);
    if (near) { d[i * 4] = 18; d[i * 4 + 1] = 14; d[i * 4 + 2] = 11; d[i * 4 + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
};

SPR._drawFlame = (frame) => {
  // flame points down (out the tail of an up-facing truck), centered in 48x48
  const c = U.mkCanvas(SPR.FLAME_FRAME, SPR.FLAME_FRAME);
  const g = c.getContext('2d');
  const cx = 24, top = 34; // starts below truck rear
  const len = frame ? 11 : 9;
  const wob = frame ? 1 : -1;
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const w = Math.max(1, Math.round(7 * (1 - t)));
    const x = cx - (w >> 1) + (i > len - 4 ? wob : 0);
    R(x, top + i, w, 1, t < 0.35 ? '#fff8d0' : t < 0.7 ? '#ffe066' : '#ff8c1a');
  }
  R(cx - 4, top - 1, 8, 2, '#ffcf40');
  return c;
};

SPR.init = () => {
  const F = SPR.FRAME;
  for (const pal of SPR.PALETTES) {
    const byChassis = [];
    for (let ch = 0; ch < SPR.CHASSIS.length; ch++) {
      const base = SPR._drawTruckBase(pal, ch);
      const frames = [];
      for (let i = 0; i < 16; i++) {
        const c = U.mkCanvas(F, F);
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.translate(F / 2, F / 2);
        g.rotate(i * Math.PI / 8);
        g.drawImage(base, -13, -13);
        g.setTransform(1, 0, 0, 1, 0, 0);
        SPR._outline(c);
        frames.push(c);
      }
      byChassis.push(frames);
    }
    SPR.trucks.push(byChassis);
  }
  // flames: [16 rotations][2 flicker frames]
  const fl0 = SPR._drawFlame(0), fl1 = SPR._drawFlame(1);
  for (let i = 0; i < 16; i++) {
    const pair = [];
    for (const src of [fl0, fl1]) {
      const c = U.mkCanvas(SPR.FLAME_FRAME, SPR.FLAME_FRAME);
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.translate(24, 24);
      g.rotate(i * Math.PI / 8);
      g.drawImage(src, -24, -24);
      pair.push(c);
    }
    SPR.flames.push(pair);
  }
  // pickups
  SPR.nitroCan = SPR._drawNitroCan();
  SPR.moneyBag = SPR._drawMoneyBag();
};

SPR._drawNitroCan = () => {
  const c = U.mkCanvas(12, 16);
  const g = c.getContext('2d');
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R(2, 5, 8, 10, '#d02818');   // body
  R(2, 5, 2, 10, '#f06048');   // lit edge
  R(9, 5, 1, 10, '#8e1810');   // shade
  R(3, 8, 6, 5, '#f5f0e0');    // label
  // lightning bolt on label
  R(6, 8, 2, 2, '#e8a010'); R(5, 10, 2, 1, '#e8a010'); R(4, 11, 2, 2, '#e8a010');
  R(4, 2, 4, 3, '#9aa2a8');    // cap
  R(5, 1, 2, 1, '#6a7076');
  SPR._outline(c);
  return c;
};

SPR._drawMoneyBag = () => {
  const c = U.mkCanvas(14, 14);
  const g = c.getContext('2d');
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R(3, 5, 8, 8, '#cfa050');            // sack
  R(2, 7, 10, 5, '#cfa050');
  R(3, 5, 2, 6, '#e8c880');            // highlight
  R(9, 6, 2, 7, '#9a7638');            // shade
  R(5, 3, 4, 2, '#8a6a30');            // tie
  R(6, 1, 2, 2, '#cfa050');            // neck
  U.text(g, '$', 5, 6, { color: '#4a3410' });
  SPR._outline(c);
  return c;
};
