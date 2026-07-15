// MUD KINGS — render3d.js : Three.js scene, track/truck/pickup geometry, physics->3D sync
// Physics/AI/rules never touch this file — it only reads GAME.G state and draws it.
// Coordinate mapping: physics x -> world X, physics y -> world Z, physics z (jump height) -> world Y.
'use strict';

const R3 = {
  ready: false,
  renderer: null, scene: null, camera: null, sunLight: null, nightLights: [],
  trackGroup: null, truckMeshes: [], truckKey: [], pickupMeshes: [],
  WORLD_W: 512, WORLD_H: 480, SCALE_Z: 0.55,
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

  R3.camera = new THREE.PerspectiveCamera(36, R3.WORLD_W / R3.WORLD_H, 20, 3000);
  R3.camera.position.set(R3.WORLD_W / 2, 520, R3.WORLD_H / 2 + 470);
  R3.camera.lookAt(R3.WORLD_W / 2, 0, R3.WORLD_H / 2 - 30);

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

  R3.ready = true;
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
// then layers real 3D geometry on top for the pieces that need actual depth ----------
R3.buildTrack = (track) => {
  if (!R3.ready) return;
  if (R3.trackGroup) { R3.scene.remove(R3.trackGroup); R3._disposeGroup(R3.trackGroup); }
  const grp = new THREE.Group();

  const tex = new THREE.CanvasTexture(track.canvas);
  tex.needsUpdate = true;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(R3.WORLD_W, R3.WORLD_H), groundMat);
  ground.userData.ownGeo = true; ground.userData.ownMat = true;
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(R3.WORLD_W / 2, 0, R3.WORLD_H / 2);
  ground.receiveShadow = true;
  grp.add(ground);

  const DRIVABLE = { '.': 1, 'S': 1, 'J': 1, 'M': 1, 'W': 1 };
  const isRailAt = (nx, ny) => nx >= 0 && ny >= 0 && nx < TRK.COLS && ny < TRK.ROWS &&
    !DRIVABLE[track.grid[ny][nx]] && track.grid[ny][nx] !== '#' && track.grid[ny][nx] !== 'G';

  for (let ty = 0; ty < TRK.ROWS; ty++) for (let tx = 0; tx < TRK.COLS; tx++) {
    const ch = track.grid[ty][tx];
    if (!DRIVABLE[ch]) continue;
    const x = tx * 16 + 8, z = ty * 16 + 8;
    const mat = ((tx + ty) & 1) ? R3._railMatWhite : R3._railMatRed;
    if (isRailAt(tx, ty - 1)) { const m = new THREE.Mesh(R3._railBoxH, mat); m.position.set(x, 3.5, z - 8); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    if (isRailAt(tx, ty + 1)) { const m = new THREE.Mesh(R3._railBoxH, mat); m.position.set(x, 3.5, z + 8); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    if (isRailAt(tx - 1, ty)) { const m = new THREE.Mesh(R3._railBoxV, mat); m.position.set(x - 8, 3.5, z); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    if (isRailAt(tx + 1, ty)) { const m = new THREE.Mesh(R3._railBoxV, mat); m.position.set(x + 8, 3.5, z); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    if (ch === 'J') {
      const mound = new THREE.Mesh(new THREE.SphereGeometry(9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), R3._mogulMat);
      mound.userData.ownGeo = true;
      mound.position.set(x, 0, z);
      mound.scale.set(1, 0.5, 1);
      mound.castShadow = true; mound.receiveShadow = true;
      grp.add(mound);
    }
  }

  R3.trackGroup = grp;
  R3.scene.add(grp);
};

R3.setNight = (isNight) => {
  if (!R3.ready) return;
  R3.amb.intensity = isNight ? 0.32 : 0.62;
  R3.sunLight.intensity = isNight ? 0.35 : 1.05;
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
    m.position.y = 8 + Math.sin(p.bob) * 1.6;
    m.rotation.y = p.bob;
  }
};

// ---------- trucks: procedurally-built low-poly 3D models, not sprites ----------
R3.buildTruckMesh = (colorIdx, chassisIdx) => {
  const pal = SPR.PALETTES[colorIdx];
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.body), roughness: 0.45, metalness: 0.15 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.dark), roughness: 0.6 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.light), roughness: 0.4 });
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

  const mkWheel = (x, z, big) => {
    const w = new THREE.Mesh(R3._wheelGeo, R3._tireMat);
    w.rotation.z = Math.PI / 2;
    const s = big ? 1.28 : 1;
    w.scale.set(s, 1, s);
    w.position.set(x, big ? 5.6 : 4.4, z);
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

  return grp;
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
    m.position.set(t.x, t.z * R3.SCALE_Z + bob, t.y);
    m.rotation.y = Math.PI / 2 - t.heading;
    m.rotation.x = t.z > 30 ? -0.22 : 0;
  }
};

R3.render = () => { if (R3.ready) R3.renderer.render(R3.scene, R3.camera); };
