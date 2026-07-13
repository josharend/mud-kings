// MUD KINGS — shop.js : the SPEED SHOP between races
'use strict';

const SHOP = {
  ITEMS: [
    { key: 'tires', name: 'TIRES', desc: 'GRIP + TURNING' },
    { key: 'shocks', name: 'SHOCKS', desc: 'SOFTER LANDINGS' },
    { key: 'accel', name: 'ENGINE', desc: 'ACCELERATION' },
    { key: 'top', name: 'GEARBOX', desc: 'TOP SPEED' },
    { key: 'nitro', name: 'NITRO X3', desc: 'BOOST BOTTLES' },
    { key: 'done', name: 'DONE', desc: 'BACK TO THE TRACK' },
  ],
  cursor: 0, player: 0, timer: 20,
};

SHOP.enter = () => {
  SHOP.cursor = 0;
  SHOP.player = 0;
  SHOP.timer = 20;
  GAME.G.mode = 'shop';
  GAME.G.stateT = 0;
  MUSIC.want('shop');
};

SHOP._price = (item, p) => {
  if (item.key === 'nitro') return TUNE.NITRO_PRICE;
  if (item.key === 'done') return 0;
  const lvl = p.upg[item.key];
  return lvl >= TUNE.MAX_LVL ? -1 : TUNE.SHOP_PRICE(lvl);
};

SHOP.tick = (dt) => {
  const G = GAME.G;
  SHOP.timer -= dt;
  const p = G.players[SHOP.player];

  const move = (d) => {
    SHOP.cursor = (SHOP.cursor + d + SHOP.ITEMS.length) % SHOP.ITEMS.length;
    SND.cursor();
  };
  if (INPUT.wasPressed('ArrowLeft') || INPUT.wasPressed('KeyA')) move(-1);
  if (INPUT.wasPressed('ArrowRight') || INPUT.wasPressed('KeyD')) move(1);
  if (INPUT.wasPressed('ArrowUp') || INPUT.wasPressed('KeyW')) move(-3);
  if (INPUT.wasPressed('ArrowDown') || INPUT.wasPressed('KeyS')) move(3);

  let done = SHOP.timer <= 0;
  if (INPUT.wasPressed('Enter') || INPUT.wasPressed('Space')) {
    const item = SHOP.ITEMS[SHOP.cursor];
    if (item.key === 'done') done = true;
    else {
      const price = SHOP._price(item, p);
      if (price < 0) SND.deny();
      else if (p.money < price) SND.deny();
      else {
        p.money -= price;
        if (item.key === 'nitro') p.nitros = Math.min(9, p.nitros + 3);
        else p.upg[item.key]++;
        SND.buy();
      }
    }
  }
  if (INPUT.wasPressed('Escape')) done = true;

  if (done) {
    SHOP.player++;
    if (SHOP.player >= G.humans) GAME.nextRace();
    else { SHOP.cursor = 0; SHOP.timer = 20; }
  }
};

SHOP.draw = (ctx) => {
  const G = GAME.G;
  const p = G.players[SHOP.player];
  const pal = SPR.PALETTES[SHOP.player];

  // backdrop: garage
  ctx.fillStyle = '#1c1a22'; ctx.fillRect(0, 0, 512, 480);
  // floor
  ctx.fillStyle = '#3a3640'; ctx.fillRect(0, 340, 512, 140);
  for (let x = 0; x < 512; x += 32) { ctx.fillStyle = '#322e38'; ctx.fillRect(x, 340, 16, 140); }
  // back wall stripes
  ctx.fillStyle = '#26232c'; ctx.fillRect(0, 0, 512, 70);
  ctx.fillStyle = '#e8c020';
  for (let x = 0; x < 512; x += 48) {
    ctx.save(); ctx.beginPath();
    ctx.moveTo(x, 58); ctx.lineTo(x + 24, 58); ctx.lineTo(x + 12, 70); ctx.lineTo(x - 12, 70);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  U.text(ctx, 'SPEED SHOP', 256, 16, { scale: 4, color: '#ffd040', align: 'center', outline: '#000' });

  // player banner + money + timer
  ctx.fillStyle = pal.body; ctx.fillRect(28, 78, 10, 10);
  ctx.strokeStyle = '#000'; ctx.strokeRect(28.5, 78.5, 9, 9);
  U.text(ctx, 'PLAYER ' + (SHOP.player + 1), 44, 80, { scale: 2, color: pal.light });
  U.text(ctx, U.fmtMoney(p.money), 484, 80, { scale: 2, color: '#5aff5a', align: 'right' });
  // timer bar
  const tw = U.clamp(SHOP.timer / 20, 0, 1) * 456;
  ctx.fillStyle = '#33303a'; ctx.fillRect(28, 100, 456, 6);
  ctx.fillStyle = SHOP.timer < 5 ? '#e02818' : '#8fd06a'; ctx.fillRect(28, 100, tw, 6);

  // the player's truck on display
  ctx.drawImage(SPR.truck(SHOP.player, p.chassis)[4], 224, 380, 64, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(256, 446, 34, 8, 0, 0, U.TAU); ctx.fill();

  // item cards: 2 rows x 3
  for (let i = 0; i < SHOP.ITEMS.length; i++) {
    const item = SHOP.ITEMS[i];
    const col = i % 3, row = (i / 3) | 0;
    const x = 34 + col * 152, y = 122 + row * 104;
    const sel = i === SHOP.cursor;
    ctx.fillStyle = sel ? '#3a3444' : '#26232c';
    ctx.fillRect(x, y, 140, 92);
    ctx.strokeStyle = sel ? '#ffd040' : '#44404c';
    ctx.lineWidth = sel ? 2 : 1;
    ctx.strokeRect(x + 1, y + 1, 138, 90);
    ctx.lineWidth = 1;

    SHOP._icon(ctx, item.key, x + 12, y + 10);
    U.text(ctx, item.name, x + 44, y + 12, { scale: 2, color: sel ? '#ffd040' : '#dde' });
    U.text(ctx, item.desc, x + 44, y + 30, { color: '#99a' });

    if (item.key === 'done') {
      U.text(ctx, 'GOOD LUCK!', x + 12, y + 62, { color: '#8fd' });
    } else if (item.key === 'nitro') {
      U.text(ctx, U.fmtMoney(TUNE.NITRO_PRICE), x + 12, y + 46, { scale: 2, color: '#5aff5a' });
      U.text(ctx, 'HAVE: ' + p.nitros, x + 12, y + 66, { color: '#f88' });
    } else {
      const lvl = p.upg[item.key];
      const price = SHOP._price(item, p);
      U.text(ctx, price < 0 ? 'MAXED!' : U.fmtMoney(price), x + 12, y + 46, { scale: 2, color: price < 0 ? '#888' : (p.money >= price ? '#5aff5a' : '#e05a50') });
      // level pips
      for (let l = 0; l < TUNE.MAX_LVL; l++) {
        ctx.fillStyle = l < lvl ? '#ffd040' : '#44404c';
        ctx.fillRect(x + 12 + l * 12, y + 66, 9, 7);
      }
    }
  }

  U.text(ctx, 'ARROWS: SELECT   ENTER: BUY   ESC: DONE', 256, 336, { color: '#889', align: 'center' });
};

SHOP._icon = (ctx, key, x, y) => {
  const R = (dx, dy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x + dx, y + dy, w, h); };
  if (key === 'tires') {
    ctx.fillStyle = '#14110e'; ctx.beginPath(); ctx.arc(x + 12, y + 12, 11, 0, U.TAU); ctx.fill();
    ctx.fillStyle = '#2b2622'; ctx.beginPath(); ctx.arc(x + 12, y + 12, 7, 0, U.TAU); ctx.fill();
    ctx.fillStyle = '#96a0a8'; ctx.beginPath(); ctx.arc(x + 12, y + 12, 3, 0, U.TAU); ctx.fill();
  } else if (key === 'shocks') {
    R(9, 0, 6, 4, '#96a0a8');
    for (let i = 0; i < 4; i++) R(7, 5 + i * 4, 10, 2, '#e05a50');
    R(9, 20, 6, 4, '#96a0a8');
  } else if (key === 'accel') {
    R(4, 6, 16, 12, '#78808a'); R(2, 9, 2, 6, '#565b63'); R(20, 9, 2, 6, '#565b63');
    R(7, 2, 3, 4, '#565b63'); R(14, 2, 3, 4, '#565b63');
    R(6, 9, 12, 6, '#3a3f44');
  } else if (key === 'top') {
    ctx.fillStyle = '#e6e2d6'; ctx.beginPath(); ctx.arc(x + 12, y + 14, 11, Math.PI, U.TAU); ctx.fill();
    ctx.strokeStyle = '#e02818'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 12, y + 14); ctx.lineTo(x + 19, y + 6); ctx.stroke();
    ctx.lineWidth = 1;
  } else if (key === 'nitro') {
    ctx.drawImage(SPR.nitroCan, x + 3, y + 2, 18, 24);
  } else {
    // checkered flag
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
      R(4 + c * 5, 2 + r * 5, 5, 5, ((r + c) & 1) ? '#e8e8e8' : '#181818');
    R(2, 0, 2, 26, '#8a5a33');
  }
};
