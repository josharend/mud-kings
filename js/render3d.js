// MUD KINGS — render3d.js : Three.js scene, track/truck/pickup geometry, physics->3D sync
// Physics/AI/rules never touch this file — it only reads GAME.G state and draws it.
// Coordinate mapping: physics x -> world X, physics y -> world Z, physics z (jump height) -> world Y.
'use strict';

const R3 = {
  ready: false,
  renderer: null, scene: null, camera: null, sunLight: null, nightLights: [],
  trackGroup: null, truckMeshes: [], truckKey: [], pickupMeshes: [],
  WORLD_W: 512, WORLD_H: 480, SCALE_Z: 0.8,
  _heightFn: null,                // current track's terrain height sampler — world(x,z) -> y
  // terrain amplitudes live in TRK (BERM_AMP / NOISE_AMP): the height field is shared
  // between the 2D baked-relief shading and the 3D displacement via TRK.mkHeightField
};

R3.init = (canvas) => {
  if (typeof THREE === 'undefined') return; // CDN blocked/offline — caller falls back to 2D
  try {
    R3.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) { return; }
  R3.renderer.setSize(R3.WORLD_W, R3.WORLD_H, false);
  R3.renderer.setPixelRatio(1);
  R3.renderer.shadowMap.enabled = true;
  R3.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (THREE.SRGBColorSpace) R3.renderer.outputColorSpace = THREE.SRGBColorSpace;

  R3.scene = new THREE.Scene();
  R3.scene.background = new THREE.Color(0x0b0a10);
  R3.scene.fog = new THREE.Fog(0x0b0a10, 950, 1900);

  // near-top-down like the cabinet, framed so the track fills the whole screen — relief
  // reads through the baked slope shading in the ground texture (which matches the real
  // displaced geometry exactly), not through a raked camera angle wasting screen space
  R3.camera = new THREE.PerspectiveCamera(40, R3.WORLD_W / R3.WORLD_H, 20, 3000);
  R3.camera.position.set(R3.WORLD_W / 2, 610, R3.WORLD_H / 2 + 300);
  R3.camera.lookAt(R3.WORLD_W / 2, 0, R3.WORLD_H / 2 - 6);

  R3.amb = new THREE.AmbientLight(0xffffff, 0.62);
  R3.scene.add(R3.amb);

  const sun = new THREE.DirectionalLight(0xfff3e0, 1.05);
  sun.position.set(-260, 420, -160);
  sun.target.position.set(R3.WORLD_W / 2, 0, R3.WORLD_H / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -300; sun.shadow.camera.right = 300;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.near = 100; sun.shadow.camera.far = 950;
  sun.shadow.bias = -0.0018;
  R3.scene.add(sun); R3.scene.add(sun.target);
  R3.sunLight = sun;

  // shared materials/geometries reused across every truck & rail segment
  R3._tireMat = new THREE.MeshStandardMaterial({ color: 0x201c18, roughness: 0.95 });
  R3._chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.25, metalness: 0.6 });
  R3._glassMat = new THREE.MeshStandardMaterial({ color: 0x14202e, roughness: 0.15, metalness: 0.2 });
  R3._wheelGeo = new THREE.CylinderGeometry(5.5, 5.5, 4, 12);
  R3._railBoxH = new THREE.BoxGeometry(16, 7, 4);
  R3._railBoxV = new THREE.BoxGeometry(4, 7, 16);
  R3._railMatRed = new THREE.MeshStandardMaterial({ color: 0xc8342a, roughness: 0.4 });
  R3._railMatWhite = new THREE.MeshStandardMaterial({ color: 0xe6e2d6, roughness: 0.4 });
  R3._mogulMat = new THREE.MeshStandardMaterial({ color: 0xc89058, roughness: 0.9 });
  R3._sackMat = new THREE.MeshStandardMaterial({ color: 0xcfa050, roughness: 0.85 });
  R3._canMat = new THREE.MeshStandardMaterial({ color: 0xd02818, roughness: 0.3, metalness: 0.3 });

  R3._buildStadium();
  R3.ready = true;
};

// packed-crowd texture for the grandstands: dark risers + hundreds of colorful specks
R3._mkCrowdTex = () => {
  const c = U.mkCanvas(256, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#2c2a33'; g.fillRect(0, 0, 256, 64);
  for (let y = 6; y < 64; y += 8) { g.fillStyle = '#211f28'; g.fillRect(0, y, 256, 2); }
  const cols = ['#e04040', '#e8c040', '#40a0e0', '#40c080', '#e080c0', '#f0ece0', '#e08030'];
  const rnd = U.rng(777);
  for (let i = 0; i < 460; i++) {
    g.fillStyle = cols[(rnd() * cols.length) | 0];
    g.fillRect((rnd() * 254) | 0, (rnd() * 61) | 0, 2, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
};

// the stadium bowl around the platform: a dark arena floor plus four crowd-covered
// grandstand walls with rooflines — this is what stops the track reading as a floating
// carpet in a gray void. Built once at init; it never changes per track.
R3._buildStadium = () => {
  const W = R3.WORLD_W, H = R3.WORLD_H;
  const grp = new THREE.Group();

  // arena floor sits WELL below the terrain's deepest noise dip (~-5) — at a shallow
  // depth it z-fights up through every dip in the ground mesh as big dark blobs
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 2600),
    new THREE.MeshStandardMaterial({ color: 0x221f27, roughness: 1 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(W / 2, -11.8, H / 2);
  apron.receiveShadow = true;
  grp.add(apron);

  const crowdTex = R3._mkCrowdTex();
  const mkStand = (len) => {
    const t = crowdTex.clone();
    t.needsUpdate = true;
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, Math.round(len / 128)), 1);
    const s = new THREE.Group();
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(len, 38, 18),
      new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
    wall.position.y = 19;
    s.add(wall);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(len + 8, 3.5, 26),
      new THREE.MeshStandardMaterial({ color: 0x16141c, roughness: 0.8 }));
    roof.position.y = 40;
    s.add(roof);
    return s;
  };
  const north = mkStand(W + 140); north.position.set(W / 2, 0, -24); grp.add(north);
  const south = mkStand(W + 140); south.position.set(W / 2, 0, H + 24); grp.add(south);
  const west = mkStand(H + 60); west.rotation.y = Math.PI / 2; west.position.set(-24, 0, H / 2); grp.add(west);
  const east = mkStand(H + 60); east.rotation.y = Math.PI / 2; east.position.set(W + 24, 0, H / 2); grp.add(east);

  R3.scene.add(grp);
};

R3._disposeGroup = (grp) => {
  grp.traverse(o => {
    if (o.geometry && o.userData.ownGeo) o.geometry.dispose();
    if (o.material && o.userData.ownMat) {
      if (o.material.map) o.material.map.dispose(); // material.dispose() does NOT free its texture
      o.material.dispose();
    }
  });
};

// ---------- track: reuses the existing fully-painted 2D canvas as the ground texture,
// displaced into real rolling terrain, then layers 3D geometry on top for the barrier/moguls ----------
R3.buildTrack = (track) => {
  if (!R3.ready) return;
  if (R3.trackGroup) { R3.scene.remove(R3.trackGroup); R3._disposeGroup(R3.trackGroup); }
  const grp = new THREE.Group();

  const DRIVABLE = { '.': 1, 'S': 1, 'J': 1, 'M': 1, 'W': 1 };
  const isRailAt = (nx, ny) => nx >= 0 && ny >= 0 && nx < TRK.COLS && ny < TRK.ROWS &&
    !DRIVABLE[track.grid[ny][nx]] && track.grid[ny][nx] !== '#' && track.grid[ny][nx] !== 'G';

  // carved-bowl terrain: the SAME shared height field the 2D texture bakes its relief
  // shading from (TRK.mkHeightField) — painted light and displaced geometry always agree
  const CO = TRK.COLS, RO = TRK.ROWS;
  const heightAt = TRK.mkHeightField(track);
  R3._heightFn = heightAt;

  const tex = new THREE.CanvasTexture(track.canvas);
  tex.needsUpdate = true;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const groundGeo = new THREE.PlaneGeometry(R3.WORLD_W, R3.WORLD_H, 96, 90);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + R3.WORLD_W / 2, wz = R3.WORLD_H / 2 - pos.getY(i);
    // outermost vertices fold straight down into a skirt so the platform reads as a
    // solid slab on the arena floor — no see-through slit under the terrain edge
    if (wx < 3 || wz < 3 || wx > R3.WORLD_W - 3 || wz > R3.WORLD_H - 3) pos.setZ(i, -12);
    else pos.setZ(i, heightAt(wx, wz));
  }
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.userData.ownGeo = true; ground.userData.ownMat = true;
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(R3.WORLD_W / 2, 0, R3.WORLD_H / 2);
  ground.receiveShadow = true;
  grp.add(ground);

  for (let ty = 0; ty < TRK.ROWS; ty++) for (let tx = 0; tx < TRK.COLS; tx++) {
    const ch = track.grid[ty][tx];
    if (!DRIVABLE[ch]) continue;
    const x = tx * 16 + 8, z = ty * 16 + 8, h = heightAt(x, z);
    const mat = ((tx + ty) & 1) ? R3._railMatWhite : R3._railMatRed;
    if (isRailAt(tx, ty - 1)) { const m = new THREE.Mesh(R3._railBoxH, mat); m.position.set(x, 3.5 + h, z - 8); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    if (isRailAt(tx, ty + 1)) { const m = new THREE.Mesh(R3._railBoxH, mat); m.position.set(x, 3.5 + h, z + 8); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    if (isRailAt(tx - 1, ty)) { const m = new THREE.Mesh(R3._railBoxV, mat); m.position.set(x - 8, 3.5 + h, z); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    if (isRailAt(tx + 1, ty)) { const m = new THREE.Mesh(R3._railBoxV, mat); m.position.set(x + 8, 3.5 + h, z); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    if (ch === 'J') {
      const mound = new THREE.Mesh(new THREE.SphereGeometry(9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), R3._mogulMat);
      mound.userData.ownGeo = true;
      mound.position.set(x, h, z);
      mound.scale.set(1, 0.5, 1);
      mound.castShadow = true; mound.receiveShadow = true;
      grp.add(mound);
    }
  }

  // strings of colored pennant flags sagging across the track — the cabinet's signature
  // dressing. Posts sit just past the rails on either side of the corridor, found by
  // stepping outward from the centerline until the grid stops being drivable.
  const FLAG_COLS = [0xe04040, 0xe8c040, 0x40a0e0, 0xf0ece0, 0x40c080];
  const addFlagLine = (wpA, wpB) => {
    const px0 = wpA[0], pz0 = wpA[1];
    const dl = Math.hypot(wpB[0] - px0, wpB[1] - pz0) || 1;
    const nx = -(wpB[1] - pz0) / dl, nz = (wpB[0] - px0) / dl;
    const edge = (sgn) => {
      for (let t = 0; t < 90; t += 3) {
        const tx = U.clamp((px0 + nx * sgn * t) / 16 | 0, 0, CO - 1);
        const tz = U.clamp((pz0 + nz * sgn * t) / 16 | 0, 0, RO - 1);
        if (!DRIVABLE[track.grid[tz][tx]]) return t + 6;
      }
      return 42;
    };
    const tA = edge(1), tB = edge(-1);
    const ax = px0 + nx * tA, az = pz0 + nz * tA;
    const bx = px0 - nx * tB, bz = pz0 - nz * tB;
    const ah = heightAt(ax, az), bh = heightAt(bx, bz);
    const postH = 30;
    for (const [x, z, hh] of [[ax, az, ah], [bx, bz, bh]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, postH, 6), R3._chromeMat);
      post.userData.ownGeo = true;
      post.position.set(x, hh + postH / 2, z);
      post.castShadow = true;
      grp.add(post);
    }
    const N = 11, posArr = [], colArr = [], ropePts = [];
    const topA = ah + postH - 1, topB = bh + postH - 1;
    const sagY = (t) => topA + (topB - topA) * t - 7 * Math.sin(Math.PI * t);
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1);
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = sagY(t);
      ropePts.push(new THREE.Vector3(x, y, z));
      if (k < N - 1) {
        const t2 = (k + 1) / (N - 1);
        const x2 = ax + (bx - ax) * t2, z2 = az + (bz - az) * t2, y2 = sagY(t2);
        const c = new THREE.Color(FLAG_COLS[k % FLAG_COLS.length]);
        // apex leans down AND toward the camera (+z) so the triangles stay readable
        // from the near-top-down view instead of compressing into an invisible line
        posArr.push(x, y, z, x2, y2, z2, (x + x2) / 2, (y + y2) / 2 - 5, (z + z2) / 2 + 6);
        for (let v = 0; v < 3; v++) colArr.push(c.r, c.g, c.b);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    const flags = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    flags.userData.ownGeo = true; flags.userData.ownMat = true;
    grp.add(flags);
    const rope = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ropePts),
      new THREE.LineBasicMaterial({ color: 0xbfc4ca }));
    rope.userData.ownGeo = true; rope.userData.ownMat = true;
    grp.add(rope);
  };
  // only hang flags where the corridor runs north-south, so the rope spans left-right
  // on screen — a rope running toward the camera projects edge-on as an ugly vertical
  // streak with its flags invisible
  const wn = track.wps.length;
  const cands = [];
  for (let i = 0; i < wn; i++) {
    const a = track.wps[i], b = track.wps[(i + 1) % wn];
    if (Math.abs(b[1] - a[1]) >= Math.abs(b[0] - a[0])) cands.push(i);
  }
  if (cands.length === 0) cands.push(0);
  const picks = new Set([cands[0], cands[Math.floor(cands.length / 2)], cands[cands.length - 1]]);
  for (const i of picks) addFlagLine(track.wps[i], track.wps[(i + 1) % wn]);

  R3.trackGroup = grp;
  R3.scene.add(grp);
};

R3.setNight = (isNight) => {
  if (!R3.ready) return;
  R3.amb.intensity = isNight ? 0.34 : 0.9;
  R3.sunLight.intensity = isNight ? 0.35 : 1.35;
  if (isNight && R3.nightLights.length === 0) {
    for (const [lx, lz] of [[80, 80], [432, 80], [80, 400], [432, 400]]) {
      const pl = new THREE.PointLight(0xffe6b0, 1.4, 260, 2);
      pl.position.set(lx, 130, lz);
      R3.scene.add(pl);
      R3.nightLights.push(pl);
    }
  }
  for (const pl of R3.nightLights) pl.visible = isNight;
};

// ---------- pickups ----------
R3.buildPickups = (pickups) => {
  if (!R3.ready) return;
  for (const m of R3.pickupMeshes) { R3.scene.remove(m); R3._disposeGroup(m); }
  R3.pickupMeshes = pickups.map(p => {
    const grp = new THREE.Group();
    if (p.k === 'money') {
      const sack = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), R3._sackMat);
      sack.userData.ownGeo = true;
      sack.scale.set(1, 1.15, 0.9);
      sack.castShadow = true;
      grp.add(sack);
    } else {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 11, 10), R3._canMat);
      can.userData.ownGeo = true;
      can.castShadow = true;
      grp.add(can);
    }
    grp.position.set(p.x, 8, p.y);
    R3.scene.add(grp);
    return grp;
  });
};

R3.syncPickups = (pickups) => {
  if (!R3.ready) return;
  for (let i = 0; i < pickups.length; i++) {
    const m = R3.pickupMeshes[i];
    if (!m) continue;
    const p = pickups[i];
    m.visible = p.alive;
    const h = R3._heightFn ? R3._heightFn(p.x, p.y) : 0;
    m.position.y = 8 + h + Math.sin(p.bob) * 1.6;
    m.rotation.y = p.bob;
  }
};

// ---------- trucks: procedurally-built low-poly 3D models, not sprites ----------
// Real arcade trucks sit at ~half their lane width. With 64px lanes, scale 1.0 puts the
// 36-unit model at ~0.55 of the lane — the cabinet's proportion. Physics untouched.
R3.TRUCK_SCALE = 1.0;

R3.buildTruckMesh = (colorIdx, chassisIdx) => {
  const pal = SPR.PALETTES[colorIdx];
  // slight emissive so team colors pop vividly at small size, like the cabinet's sprites
  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pal.body), roughness: 0.45, metalness: 0.15,
    emissive: new THREE.Color(pal.body).multiplyScalar(0.22),
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.dark), roughness: 0.6 });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pal.light), roughness: 0.4,
    emissive: new THREE.Color(pal.light).multiplyScalar(0.18),
  });
  const grp = new THREE.Group();
  const own = (mesh, geo) => { mesh.userData.ownGeo = true; mesh.userData.ownMat = false; if (geo) mesh.geometry = geo; return mesh; };

  const chassis = own(new THREE.Mesh(new THREE.BoxGeometry(15, 5, 26), darkMat));
  chassis.position.y = 6; chassis.castShadow = true; chassis.receiveShadow = true;
  grp.add(chassis);

  const hood = own(new THREE.Mesh(new THREE.BoxGeometry(13, 4, 9), bodyMat));
  hood.position.set(0, 9, 8); hood.castShadow = true;
  grp.add(hood);
  const stripe = own(new THREE.Mesh(new THREE.BoxGeometry(3, 4.3, 9.3), stripeMat));
  stripe.position.set(0, 9, 8);
  grp.add(stripe);

  const cab = own(new THREE.Mesh(new THREE.BoxGeometry(13, 7, 8), bodyMat));
  cab.position.set(0, 12.5, -2); cab.castShadow = true;
  grp.add(cab);
  const windshield = own(new THREE.Mesh(new THREE.BoxGeometry(11.5, 5, 1), R3._glassMat));
  windshield.position.set(0, 12.5, 2.4);
  grp.add(windshield);

  const rollBar = own(new THREE.Mesh(new THREE.BoxGeometry(13, 1.5, 1.5), R3._chromeMat));
  rollBar.position.set(0, 16.5, -6);
  grp.add(rollBar);

  const bed = own(new THREE.Mesh(new THREE.BoxGeometry(13, 6, 9), darkMat));
  bed.position.set(0, 9, -10); bed.castShadow = true;
  grp.add(bed);

  const bumperF = own(new THREE.Mesh(new THREE.BoxGeometry(15, 2.5, 1.5), R3._chromeMat));
  bumperF.position.set(0, 6.5, 12.5);
  grp.add(bumperF);

  // wheel Y = its own radius exactly, so the tire bottom sits flush on y=0 —
  // matters a lot once the whole truck gets scaled up (any gap/overlap scales too)
  const mkWheel = (x, z, big) => {
    const w = new THREE.Mesh(R3._wheelGeo, R3._tireMat);
    w.rotation.z = Math.PI / 2;
    const s = big ? 1.28 : 1;
    w.scale.set(s, 1, s);
    w.position.set(x, 5.5 * s, z);
    w.castShadow = true;
    return w;
  };
  grp.add(mkWheel(-9, 9.5, false)); grp.add(mkWheel(9, 9.5, false));
  grp.add(mkWheel(-9.6, -9.5, true)); grp.add(mkWheel(9.6, -9.5, true));

  if (chassisIdx === 1) { // JACKRABBIT: rear spoiler
    const wing = own(new THREE.Mesh(new THREE.BoxGeometry(15, 1.2, 4), R3._chromeMat));
    wing.position.set(0, 15.5, -13.5); wing.castShadow = true;
    grp.add(wing);
    const strut = own(new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), darkMat));
    strut.position.set(-6, 13, -13); grp.add(strut);
    const strut2 = own(new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), darkMat));
    strut2.position.set(6, 13, -13); grp.add(strut2);
  } else if (chassisIdx === 2) { // BULLDOG: heavy bull bar
    const bar = own(new THREE.Mesh(new THREE.BoxGeometry(15, 3.5, 1.5), R3._chromeMat));
    bar.position.set(0, 8, 13.2); bar.castShadow = true;
    grp.add(bar);
  } else { // MUDCAT: side snorkel
    const snork = own(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 10, 6), darkMat));
    snork.position.set(7.5, 12, 3); snork.castShadow = true;
    grp.add(snork);
  }

  const outer = new THREE.Group();
  grp.scale.setScalar(R3.TRUCK_SCALE);
  outer.add(grp);
  return outer;
};

R3.buildTrucks = (trucks) => {
  if (!R3.ready) return;
  for (const m of R3.truckMeshes) { R3.scene.remove(m); R3._disposeGroup(m); }
  R3.truckMeshes = trucks.map(t => {
    const m = R3.buildTruckMesh(t.color, t.chassis);
    R3.scene.add(m);
    return m;
  });
  R3.truckKey = trucks.map(t => t.color + ':' + t.chassis);
};

// rebuilds only if the roster actually changed (color/chassis) — avoids a full
// geometry rebuild every single frame when only positions are moving
R3.ensureTrucks = (trucks) => {
  const key = trucks.map(t => t.color + ':' + t.chassis).join(',');
  if (key !== R3.truckKey.join(',')) R3.buildTrucks(trucks);
};

R3.syncTrucks = (trucks, frame) => {
  if (!R3.ready) return;
  for (let i = 0; i < trucks.length; i++) {
    const t = trucks[i], m = R3.truckMeshes[i];
    if (!m) continue;
    const hideBlink = (t.rescueT > 0 || t.ghostT > 0) && ((frame >> 2) & 1);
    m.visible = !hideBlink;
    if (hideBlink) continue;
    const spd = Math.hypot(t.vx, t.vy);
    const bob = t.z > 0 ? 0 : Math.sin(t.bobPhase) * (spd / 240) * 1.1;
    const h = R3._heightFn ? R3._heightFn(t.x, t.y) : 0;
    m.position.set(t.x, t.z * R3.SCALE_Z + bob + h, t.y);
    m.rotation.y = Math.PI / 2 - t.heading;
    m.rotation.x = t.z > 30 ? -0.22 : 0;
  }
};

R3.render = () => { if (R3.ready) R3.renderer.render(R3.scene, R3.camera); };
