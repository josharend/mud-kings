// MUD KINGS — sprites.js : procedural pixel-art sprites (trucks, flames, pickups)
'use strict';

const SPR = {
  PALETTES: [
    { name: 'BLUE',   body: '#2e6fd8', light: '#6aa4f0', dark: '#1d4a9a' },
    { name: 'RED',    body: '#d83a2e', light: '#f07a6a', dark: '#8e1f17' },
    { name: 'YELLOW', body: '#e8c020', light: '#f8e070', dark: '#a08010' },
    { name: 'PURPLE', body: '#9040c8', light: '#b878e8', dark: '#5c2884' },
  ],
  trucks: [],   // [palette][chassis][16] canvases FRAMExFRAME
  flames: [],   // [16][2] canvases 48x48
  FRAME: 40,
  FLAME_FRAME: 48,
};

// small color-mixing helpers so we can get 5-tone shading without bloating the palette data
SPR._hex2rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
SPR._rgb2hex = (r, g, b) => '#' + [r, g, b].map(v => U.clamp(v | 0, 0, 255).toString(16).padStart(2, '0')).join('');
SPR._mix = (hexA, hexB, t) => {
  const a = SPR._hex2rgb(hexA), b = SPR._hex2rgb(hexB);
  return SPR._rgb2hex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
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
  const c = U.mkCanvas(28, 28);
  const g = c.getContext('2d');
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

  const hi = SPR._mix(pal.light, '#ffffff', 0.45);     // chrome-bright highlight
  const deep = SPR._mix(pal.dark, '#000000', 0.4);     // deep shadow rim
  const chrome = '#e8ecf0', chromeDk = '#8a949e';

  // big knobby off-road tires: mid-tone sidewall with dark tread-groove bands cut across it, bright hub
  const tire = (x, y, w, h, knobs) => {
    R(x, y, w, h, '#413a32');           // sidewall base (mid-tone so grooves actually read)
    R(x + 1, y + 1, w - 2, h - 2, '#2b2622');
    for (let i = 0; i < knobs; i++) {
      const ky = y + Math.round((i + 0.5) * h / knobs);
      R(x, ky, w, 1, '#0c0a08');        // dark tread groove crossing the full tire
    }
    R(x, y, 1, h, '#0c0a08'); R(x + w - 1, y, 1, h, '#0c0a08'); // side edges
    R(x + (w >> 1) - 1, y + (h >> 1) - 1, 2, 2, '#c4ccd2');
  };
  tire(1, 2, 7, 8, 3);   tire(20, 2, 7, 8, 3);    // front
  tire(0, 15, 8, 12, 4); tire(20, 15, 8, 12, 4);  // rear — noticeably bigger

  // mud flaps behind the rears
  R(7, 25, 2, 3, '#1c1a18'); R(19, 25, 2, 3, '#1c1a18');

  // chassis + body, 5-tone shading for real depth at speed
  R(9, 1, 10, 25, deep);              // under-chassis / deep shadow rim
  R(9, 0, 10, 1, chromeDk);           // front bumper
  R(9, 1, 10, 7, pal.body);           // hood
  R(9, 1, 1, 7, hi);                  // hood lit edge
  R(19, 1, 1, 7, pal.dark);           // hood shaded edge
  R(13, 1, 3, 7, pal.light);          // racing stripe
  R(14, 1, 1, 7, hi);                 // stripe chrome glint
  R(10, 0, 2, 1, chrome); R(17, 0, 2, 1, chrome); // headlights
  R(10, 9, 8, 3, '#131e30');          // windshield
  R(11, 9, 2, 1, '#8fb8e0');          // glint
  R(9, 12, 10, 4, pal.body);          // cab roof
  R(9, 12, 10, 1, hi);                // roof highlight
  R(9, 16, 10, 1, chrome);            // roll bar
  R(9, 17, 10, 9, deep);              // bed shell
  R(10, 18, 8, 7, '#241a10');         // bed interior
  R(12, 20, 5, 5, '#100d0a');         // spare tire
  R(13, 21, 3, 3, '#4c5258');
  R(9, 1, 1, 16, hi);                 // lit side (left)
  R(18, 1, 1, 16, pal.dark);          // shaded side (right)

  if (chassis === 1) {                // JACKRABBIT: rear spoiler + hood scoop
    R(6, 26, 16, 2, chrome);
    R(6, 24, 2, 2, chromeDk); R(20, 24, 2, 2, chromeDk);
    R(12, 2, 4, 4, '#131e30');
  } else if (chassis === 2) {         // BULLDOG: bull bar + amber roof lights
    R(7, 0, 14, 1, chromeDk);
    R(8, 0, 1, 4, '#3a3f44'); R(19, 0, 1, 4, '#3a3f44');
    for (const lx of [11, 13, 15, 17]) R(lx, 16, 1, 1, '#ffd040');
  } else {                            // MUDCAT: modest hood scoop
    R(12, 2, 4, 2, deep);
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
        g.drawImage(base, -14, -14);
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
