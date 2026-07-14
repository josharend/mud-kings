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
  FRAME: 52,
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

SPR._drawTruckBase = (pal, chassis, num) => {
  const c = U.mkCanvas(36, 36);
  const g = c.getContext('2d');
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

  // 7-tone shading ramp — lets the hood/roof read as rounded metal instead of flat blocks
  const ramp = [
    SPR._mix(pal.dark, '#000000', 0.55),
    pal.dark,
    SPR._mix(pal.dark, pal.body, 0.5),
    pal.body,
    SPR._mix(pal.body, pal.light, 0.5),
    pal.light,
    SPR._mix(pal.light, '#ffffff', 0.55),
  ];
  const chrome = '#eef1f4', chromeDk = '#7e8791', chromeSh = '#4c525a';
  const glass = '#101c30', glassHi = '#8fb8e0';

  // big knobby off-road tires: mid-tone sidewall, dark tread-groove bands, lug-nut hub
  const tire = (x, y, w, h, knobs) => {
    R(x, y, w, h, '#4a4139');
    R(x + 1, y + 1, w - 2, h - 2, '#2b2622');
    for (let i = 0; i < knobs; i++) {
      const ky = y + Math.round((i + 0.5) * h / knobs);
      R(x, ky, w, 1, '#0a0908');
    }
    R(x, y, 1, h, '#0a0908'); R(x + w - 1, y, 1, h, '#0a0908');
    const hx = x + (w >> 1), hy = y + (h >> 1);
    R(hx - 1, hy - 1, 2, 2, '#b8c0c8');
    for (const [ox, oy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) R(hx + ox, hy + oy, 1, 1, '#6a7078');
  };
  tire(1, 4, 7, 9, 3);   tire(28, 4, 7, 9, 3);     // front
  tire(1, 19, 9, 14, 4); tire(26, 19, 9, 14, 4);   // rear — noticeably bigger

  // mud flaps
  R(7, 33, 3, 2, '#161412'); R(26, 33, 3, 2, '#161412');

  // === body === (center column x11-24, 14 wide)
  R(10, 1, 15, 31, ramp[0]);                       // deep chassis rim

  // front bumper + hint of a brush guard on every chassis
  R(10, 0, 15, 2, chromeDk);
  R(13, 0, 1, 3, chromeSh); R(21, 0, 1, 3, chromeSh);
  R(11, 2, 2, 1, chrome); R(22, 2, 2, 1, chrome);  // headlights

  // hood: rounded-metal gradient across its width, racing stripe over the top
  const hoodCols = [1, 2, 3, 4, 5, 6, 6, 5, 4, 3, 2, 1];
  for (let i = 0; i < hoodCols.length; i++) R(11 + i, 3, 1, 6, ramp[hoodCols[i]]);
  R(16, 3, 3, 6, pal.light);
  R(17, 3, 1, 6, ramp[6]);

  // windshield + driver silhouette
  R(11, 10, 13, 3, glass);
  R(12, 10, 3, 1, glassHi);
  R(16, 10, 3, 2, '#1a1410');

  // cab roof: same rounded gradient, light bar across the top edge, side mirrors
  const roofCols = [1, 2, 4, 5, 6, 5, 4, 2, 1, 2, 4, 5];
  for (let i = 0; i < roofCols.length; i++) R(11 + i, 13, 1, 5, ramp[roofCols[i]]);
  for (const lx of [13, 16, 19, 22]) R(lx, 13, 1, 1, '#fff6d8');
  R(9, 14, 2, 2, chromeDk); R(24, 14, 2, 2, chromeDk);

  R(10, 18, 15, 1, chrome);                        // roll bar

  // bed / tailgate with a sponsor number decal
  R(10, 19, 15, 12, ramp[1]);
  R(11, 20, 13, 8, '#241a10');
  U.text(g, String(num), 15, 21, { color: chrome, outline: ramp[0] });
  R(14, 26, 7, 5, '#0a0908');                      // spare tire mount
  R(15, 27, 5, 3, '#5a6068');
  R(11, 30, 13, 1, chromeSh);                       // tailgate seam
  R(10, 31, 15, 2, chromeDk);                       // rear bumper

  R(10, 1, 1, 30, ramp[5]);                         // lit side (left)
  R(24, 1, 1, 30, ramp[0]);                         // shaded side (right)

  if (chassis === 1) {                // JACKRABBIT: big rear spoiler + hood scoop
    R(7, 33, 21, 2, chrome);
    R(7, 31, 2, 3, chromeDk); R(26, 31, 2, 3, chromeDk);
    R(14, 4, 7, 4, glass);
  } else if (chassis === 2) {         // BULLDOG: heavy bull bar + amber roof lights
    R(9, -1, 17, 2, chromeDk);
    R(10, -1, 1, 5, chromeSh); R(24, -1, 1, 5, chromeSh);
    for (const lx of [13, 16, 19, 22]) R(lx, 13, 1, 1, '#ffb020');
  } else {                            // MUDCAT: hood scoop + side snorkel
    R(14, 4, 7, 3, ramp[0]);
    R(24, 3, 3, 9, '#413a32'); R(24, 2, 4, 2, '#5a5248');
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
      const base = SPR._drawTruckBase(pal, ch, SPR.PALETTES.indexOf(pal) + 1);
      const frames = [];
      for (let i = 0; i < 16; i++) {
        const c = U.mkCanvas(F, F);
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.translate(F / 2, F / 2);
        g.rotate(i * Math.PI / 8);
        g.drawImage(base, -18, -18);
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
