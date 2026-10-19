// Desk toys next to the pile: a whoopee cushion and a clicky RGB keycap.
// Both are pressable; sounds are synthesised with WebAudio, nothing is downloaded.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// on a tall phone screen the table is seen through a narrow window, so the toys move in
const NARROW = innerWidth / innerHeight < 0.8;
export const PROP_SPOTS = NARROW ? [
  { x: -15, z: -30, r: 10 },   // cushion (with its nozzle), a bit smaller on phones
  { x: 15, z: -29, r: 5 },     // keycap
] : [
  { x: -21, z: -27, r: 11 },
  { x: 21, z: -26, r: 5.5 },
];

// planar top-down UVs, so a flat print lands on the top surface
function planarUV(geo, w, d) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / w + 0.5; uv[i * 2 + 1] = 0.5 - p.getZ(i) / d; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function printTexture(draw, size = 512) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.redraw = () => { draw(cv.getContext('2d'), size); t.needsUpdate = true; };
  return t;
}

// ---------------------------------------------------------------- whoopee cushion
function makeCushion(matTop) {
  const R = 7.5, g = new THREE.Group();
  const body = new THREE.SphereGeometry(1, 64, 32);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i);
    y = y < 0 ? y * 0.3 : y * 2.6;                        // flat underside, puffy top
    p.setXYZ(i, p.getX(i) * R, y, p.getZ(i) * R);
  }
  body.computeVertexNormals();
  planarUV(body, R * 2, R * 2);
  const print = printTexture((c, s) => {
    c.fillStyle = '#e4415a'; c.fillRect(0, 0, s, s);
    c.save(); c.translate(s / 2, s / 2); c.rotate(-0.18);
    c.fillStyle = '#fff4e6'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 ${s * 0.2}px Unbounded, Nunito, sans-serif`;
    c.fillText('ПФФ!', 0, s * 0.01);
    c.restore();
  });
  document.fonts && document.fonts.ready.then(print.userData.redraw);
  const rubber = new THREE.MeshPhysicalMaterial({ map: print, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.5, sheen: 0.3 });
  const mesh = new THREE.Mesh(body, rubber);
  mesh.castShadow = mesh.receiveShadow = true;
  const inflate = new THREE.Group();
  inflate.position.y = 0.3;
  inflate.add(mesh);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(R * 0.995, 0.14, 10, 96), new THREE.MeshStandardMaterial({ color: '#c23149', roughness: 0.5 }));
  seam.rotation.x = Math.PI / 2;
  inflate.add(seam);
  g.add(inflate);
  // the nozzle you'd blow it up through
  const nozzle = new THREE.Group();
  const tube = new THREE.CylinderGeometry(0.75, 1.5, 3.4, 24, 1, true);
  tube.rotateZ(-Math.PI / 2);
  tube.scale(1, 0.42, 1);
  const tm = new THREE.Mesh(tube, new THREE.MeshStandardMaterial({ color: '#d93a52', roughness: 0.45, side: THREE.DoubleSide }));
  tm.position.x = 1.5;
  tm.castShadow = true;
  nozzle.add(tm);
  const NA = -2.2;                                        // points toward the front-left
  nozzle.position.set(R - 0.6, 0.55, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), NA);
  nozzle.rotation.y = NA;
  g.add(nozzle);
  g.position.set(PROP_SPOTS[0].x, matTop, PROP_SPOTS[0].z);
  g.rotation.y = -0.35;

  const st = { squash: 0, until: 0, flutter: 0 };
  return {
    group: g, hit: [mesh, tm],
    press(ctx, now) {
      const dur = fart(ctx);
      st.until = now + dur; st.flutter = 1;
    },
    update(dt, now) {
      const blowing = now < st.until;
      // collapse fast while air rushes out, refill slowly afterwards
      st.squash += ((blowing ? 1 : 0) - st.squash) * Math.min(1, dt * (blowing ? 14 : 1.6));
      const j = blowing ? Math.sin(now * 90) * 0.04 : 0;
      inflate.scale.set(1 + st.squash * 0.12 + j, 1 - st.squash * 0.6, 1 + st.squash * 0.12 - j);
      nozzle.rotation.z = blowing ? Math.sin(now * 70) * 0.25 : nozzle.rotation.z * 0.9;
      nozzle.scale.y = 1 + (blowing ? Math.sin(now * 55) * 0.35 : 0);
    },
  };
}

// a different raspberry every time
export function fart(a) {
  if (!a) return 0.8;
  const t = a.currentTime;
  const kind = Math.random();
  const dur = kind < 0.25 ? 0.25 + Math.random() * 0.2 : 0.6 + Math.random() * 0.9;
  const f0 = 55 + Math.random() * 70;
  const out = a.createGain();
  out.gain.value = 0.45;
  out.connect(a.destination);

  const env = a.createGain();
  const pts = 32, curve = new Float32Array(pts);
  for (let i = 0; i < pts; i++) {
    const x = i / (pts - 1);
    const shape = Math.min(1, x * 12) * Math.pow(1 - x, 0.6);
    curve[i] = shape * (0.65 + Math.random() * 0.45) * 0.55;
  }
  curve[pts - 1] = 0;
  env.gain.setValueAtTime(0, t);
  env.gain.setValueCurveAtTime(curve, t + 0.005, dur);

  // the voiced buzz: a sawtooth whose pitch sags, then sometimes squeaks up at the end
  const osc = a.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f0 * 1.4, t);
  osc.frequency.exponentialRampToValueAtTime(f0, t + dur * 0.35);
  osc.frequency.exponentialRampToValueAtTime(f0 * (kind > 0.7 ? 2.4 : 0.75), t + dur);
  const wob = a.createOscillator(), wobG = a.createGain();
  wob.frequency.value = 4 + Math.random() * 6; wobG.gain.value = f0 * 0.18;
  wob.connect(wobG).connect(osc.frequency);

  // flapping lips: amplitude chopped by a fast square LFO
  const flap = a.createGain(); flap.gain.value = 0.55;
  const lfo = a.createOscillator(), lfoG = a.createGain();
  lfo.type = 'square';
  lfo.frequency.setValueAtTime(18 + Math.random() * 18, t);
  lfo.frequency.linearRampToValueAtTime(9 + Math.random() * 8, t + dur);
  lfoG.gain.value = 0.45;
  lfo.connect(lfoG).connect(flap.gain);

  // breathy air
  const nb = a.createBuffer(1, Math.ceil(a.sampleRate * (dur + 0.1)), a.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = a.createBufferSource(); noise.buffer = nb;
  const nf = a.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = kind < 0.25 ? 1600 : 500;
  const ng = a.createGain(); ng.gain.value = kind < 0.25 ? 0.9 : 0.35;
  noise.connect(nf).connect(ng).connect(flap);

  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650 + Math.random() * 400; lp.Q.value = 2.5;
  const body = a.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 220; body.gain.value = 9; body.Q.value = 1.2;
  osc.connect(flap);
  flap.connect(lp).connect(body).connect(env).connect(out);

  for (const n of [osc, wob, lfo, noise]) { n.start(t); n.stop(t + dur + 0.1); }
  return dur;
}

// ---------------------------------------------------------------- keycap on a clicky switch
function keycapGeometry() {
  const g = mergeVertices(new RoundedBoxGeometry(1, 1, 1, 6, 0.13).deleteAttribute('normal').deleteAttribute('uv'));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = y + 0.5;                                     // 0 at the bottom, 1 at the top
    x *= 1 - t * 0.26;
    z *= 1 - t * 0.3;
    z -= t * 0.04;                                         // slight sculpt toward the back
    if (y > 0.3) {                                         // cylindrical dish on top
      const k = THREE.MathUtils.smoothstep(y, 0.3, 0.5);
      y -= k * 0.07 * (1 - Math.min(1, (x / 0.37) ** 2));
    }
    p.setXYZ(i, x * 4.6, y * 2.6 + 1.3, z * 4.6);
  }
  g.computeVertexNormals();
  planarUV(g, 4.6 * 0.74, 4.6 * 0.7);
  return g;
}

function makeKeycap(matTop) {
  const g = new THREE.Group();
  // switch housing + a bit of keyboard plate it is mounted in
  const plate = new THREE.Mesh(new RoundedBoxGeometry(6.4, 0.5, 6.4, 3, 0.15), new THREE.MeshStandardMaterial({ color: '#a7afb9', roughness: 0.3, metalness: 0.7 }));
  plate.position.y = 0.25;
  plate.castShadow = plate.receiveShadow = true;
  g.add(plate);
  const housing = new THREE.Mesh(new RoundedBoxGeometry(3.6, 1.3, 3.6, 2, 0.12), new THREE.MeshStandardMaterial({ color: '#d7dbe2', roughness: 0.2, transparent: true, opacity: 0.7 }));
  housing.position.y = 0.5 + 0.65;
  g.add(housing);
  // RGB LED glow under the cap, spilling onto the plate and mat
  const glowTex = printTexture((c, s) => {
    const rg = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, 'rgba(255,255,255,0.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.clearRect(0, 0, s, s); c.fillStyle = rg; c.fillRect(0, 0, s, s);
  }, 128);
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.52;
  g.add(glow);
  const led = new THREE.PointLight('#ffffff', 0, 16, 1.6);
  led.position.y = 1.6;
  g.add(led);

  // the cap: dark PBT with a shine-through legend
  const legend = printTexture((c, s) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 ${s * 0.3}px Unbounded, Nunito, sans-serif`;
    c.fillText('ДР', s / 2, s / 2 + s * 0.02);
  }, 256);
  legend.colorSpace = THREE.NoColorSpace;
  document.fonts && document.fonts.ready.then(legend.userData.redraw);
  const capMat = new THREE.MeshStandardMaterial({ color: '#33363d', roughness: 0.75, emissive: '#ffffff', emissiveMap: legend, emissiveIntensity: 0 });
  const cap = new THREE.Mesh(keycapGeometry(), capMat);
  cap.castShadow = cap.receiveShadow = true;
  const capHolder = new THREE.Group();
  capHolder.position.y = 0.9;
  capHolder.add(cap);
  g.add(capHolder);
  g.position.set(PROP_SPOTS[1].x, matTop, PROP_SPOTS[1].z);
  g.rotation.y = 0.25;
  g.scale.setScalar(1.3);

  const col = new THREE.Color('#ff3b6b');
  let hue = Math.random(), down = false, travel = 0, vel = 0, flash = 0;
  const setColor = () => {
    hue = (hue + 0.17 + Math.random() * 0.25) % 1;
    col.setHSL(hue, 1, 0.55);
    glowMat.color.copy(col); led.color.copy(col); capMat.emissive.copy(col);
  };
  setColor();
  return {
    group: g, hit: [cap, plate, housing],
    get down() { return down; },
    press(ctx) { down = true; setColor(); flash = 1; switchSound(ctx, true); },
    release(ctx) { if (!down) return; down = false; switchSound(ctx, false); },
    update(dt, now) {
      // a stiff spring for the stem: snaps down, bounces back up
      const target = down ? -0.4 : 0;
      vel += ((target - travel) * 900 - vel * 28) * dt;
      travel += vel * dt;
      if (down && travel < target) { travel = target; vel = 0; }
      capHolder.position.y = 0.9 + travel;
      flash = Math.max(0, flash - dt * 1.4);
      const breathe = 0.75 + 0.25 * Math.sin(now * 2.2);
      const k = breathe + flash * 1.6;
      glowMat.opacity = Math.min(1, 0.8 * k);
      led.intensity = 45 * k;
      capMat.emissiveIntensity = 1.2 * k;
    },
  };
}

// clicky blue switch: a sharp click on the way down, a plasticky clack at the bottom,
// and a softer click on the way back up
export function switchSound(a, isDown) {
  if (!a) return;
  const t = a.currentTime;
  const burst = (at, len, freq, q, vol, type = 'bandpass') => {
    const b = a.createBuffer(1, Math.ceil(a.sampleRate * len), a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 5);
    const s = a.createBufferSource(); s.buffer = b;
    const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = a.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(a.destination); s.start(t + at);
  };
  const thock = (at, freq, vol) => {
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.setValueAtTime(freq, t + at); o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + at + 0.05);
    g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.06);
    o.connect(g).connect(a.destination); o.start(t + at); o.stop(t + at + 0.08);
  };
  if (isDown) {
    burst(0, 0.012, 5200 + Math.random() * 800, 3, 1.1);          // click jacket snaps
    burst(0.002, 0.02, 2600, 6, 0.5);
    burst(0.022, 0.035, 900 + Math.random() * 200, 1.5, 1.0);     // bottom-out clack
    thock(0.022, 420, 0.35);
  } else {
    burst(0, 0.01, 4400 + Math.random() * 600, 3, 0.55);
    burst(0.015, 0.03, 1200, 1.4, 0.45);                          // stem hits the top housing
  }
}

export function makeProps(scene, matTop) {
  const cushion = makeCushion(matTop), keycap = makeKeycap(matTop);
  if (NARROW) { cushion.group.scale.multiplyScalar(0.85); keycap.group.scale.multiplyScalar(0.85); }
  scene.add(cushion.group, keycap.group);
  const hitList = [...cushion.hit.map(m => [m, cushion]), ...keycap.hit.map(m => [m, keycap])];
  return {
    meshes: hitList.map(([m]) => m),
    which(mesh) { return (hitList.find(([m]) => m === mesh) || [])[1] || null; },
    cushion, keycap,
    update(dt, now) { cushion.update(dt, now); keycap.update(dt, now); },
  };
}
