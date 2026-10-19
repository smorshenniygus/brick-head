// Voxel sculpt of the head + brick packing. Pure data, no three.js — runs in node too.
// Units: 1 = one stud pitch; a brick layer is 1.2 tall. Face looks toward +z.

export const LAYER_H = 1.2;

export const PALETTE = {
  skin:     '#f2c3a7',
  blush:    '#e3a088',
  stubble:  '#e6b294',
  hair:     '#bd8550',
  hairDark: '#94603a',
  brow:     '#c98f5d',
  eye:      '#33241e',
  teeth:    '#f6f2e6',
  mouth:    '#5a1c1e',
  lip:      '#c45b52',
  stand:    '#2a2e35',
  standTop: '#3a3f48',
};

const SC = 1.3;               // overall scale of the sculpt
const HEAD_Y = 16.6;          // head centre height
const X0 = -12, X1 = 11;      // cell index ranges (cell i spans x in [i, i+1])
const Z0 = -14, Z1 = 13;
const LAYERS = 28;

const ell = (p, c, r) => {
  const dx = (p[0] / SC - c[0]) / r[0], dy = (p[1] / SC - c[1]) / r[1], dz = (p[2] / SC - c[2]) / r[2];
  return dx * dx + dy * dy + dz * dz;
};

// Region tests in head-local coords (y relative to HEAD_Y), shapes given at SC = 1
function inHead(x, y, z) {
  const p = [x, y, z];
  if (ell(p, [0, 2.2, -0.6], [7.0, 7.6, 8.0]) <= 1) return true;        // cranium
  if (ell(p, [0, -2.6, 0.7], [6.7, 6.2, 6.6]) <= 1) return true;        // cheeks + jaw
  if (ell(p, [0, -6.8, 2.2], [4.2, 2.4, 3.6]) <= 1) return true;        // chin
  if (ell(p, [0, -0.6, 7.0], [1.15, 1.9, 1.5]) <= 1) return true;       // nose
  if (inEar(x, y, z)) return true;
  if (ell(p, [0, 8.4, 1.6], [5.8, 2.5, 5.2]) <= 1) return true;         // quiff
  return false;
}
function inEar(x, y, z) {
  return ell([Math.abs(x), y, z], [7.0, -0.4, -0.4], [1.3, 2.3, 1.5]) <= 1;
}
function inNeck(x, y, z) {
  const r = Math.hypot(x / (4.6 * SC), (z + 1.0 * SC) / (4.6 * SC));
  return r <= 1 && y < -4 * SC;
}

// Front "pixel" map, one row per layer, one char per column x = X0..X1.
// Only paints front-facing voxels. Legend:
//  . = default (rules decide)   S skin  B blush  H hair  D dark hair  b brow  E eye
//  W teeth  M mouth (recessed)  L lip  T stubble
const FRONT = {
  22: '......S..........S......',
  21: '.....SSHHHHHHHHHHSS.....',
  20: '.....SSSSSSSSSSSSSS.....',
  19: '....SSSSSSSSSSSSSSSS....',
  17: '......bbbb....bbbb......',
  14: '.......EEE....EEE.......',
  13: '...BBBB..........BBBB...',
  12: '...BBB.....BB.....BBB...',
  11: '....BB....B..B....BB....',
   9: '......LWWWWWWWWWWL......',
   8: '......LLMMMMMMMMLL......',
   7: '.......LLLLLLLLLL.......',
   6: '........TTTTTTTT........',
   5: '.......TTTTTTTTTT.......',
   4: '.......TTTTTTTTTT.......',
};

const hash = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function buildVoxels() {
  const vox = new Map(); // key "i,j,k" -> color name
  const key = (i, j, k) => `${i},${j},${k}`;

  for (let j = 0; j < LAYERS; j++) {
    const y = (j + 0.5) * LAYER_H - HEAD_Y;
    for (let i = X0; i <= X1; i++) for (let k = Z0; k <= Z1; k++) {
      const x = i + 0.5, z = k + 0.5;
      if (j === 0) {                                   // display stand
        if (Math.abs(x) < 7 && z > -8 && z < 6) vox.set(key(i, j, k), 'stand');
        continue;
      }
      if (inHead(x, y, z) || inNeck(x, y, z)) vox.set(key(i, j, k), null);
    }
  }

  // frontmost cell per (i, j)
  const front = new Map();
  for (const kk of vox.keys()) {
    const [i, j, k] = kk.split(',').map(Number);
    const f = `${i},${j}`;
    if (!front.has(f) || front.get(f) < k) front.set(f, k);
  }

  // recess the mouth: drop the frontmost voxel, paint the next one
  for (const [j, row] of Object.entries(FRONT)) {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== 'M') continue;
      const i = X0 + c, f = `${i},${j}`;
      const kf = front.get(f);
      vox.delete(key(i, +j, kf));
      front.set(f, kf - 1);
    }
  }

  const CODE = { S: 'skin', B: 'blush', H: 'hair', D: 'hairDark', b: 'brow', E: 'eye',
                 W: 'teeth', M: 'mouth', L: 'lip', T: 'stubble' };

  for (const kk of vox.keys()) {
    if (vox.get(kk)) continue;
    const [i, j, k] = kk.split(',').map(Number);
    const x = i + 0.5, y = (j + 0.5) * LAYER_H - HEAD_Y, z = k + 0.5;
    const kf = front.get(`${i},${j}`);
    const row = FRONT[j];
    const ch = row ? row[i - X0] : '.';
    let col = null;
    if (ch !== '.' && k >= kf - (ch === 'S' || ch === 'B' || ch === 'T' ? 1 : 0)) col = CODE[ch];
    if (!col) col = sideColor(x, y, z);
    vox.set(kk, col);
  }

  return { vox, key };
}

function sideColor(x, y, z) {
  if (inEar(x, y, z) && Math.abs(x) > 6.2 * SC) return 'blush';
  x /= SC; y /= SC; z /= SC;
  // hairline height as a function of depth: high on the forehead, low at the nape
  let line;
  if (z > 3) line = 4.4;
  else if (z > -1.5) line = 2.6;
  else line = 2.6 + (z + 1.5) * 1.7;          // drops quickly towards the back
  line = Math.max(line, -6.5);
  if (y > line) return y > 5.2 ? 'hair' : 'hairDark';
  return 'skin';
}

// Only keep voxels that can be seen (have an empty 6-neighbour)
function shell(vox, key) {
  const out = new Map();
  for (const [kk, col] of vox) {
    const [i, j, k] = kk.split(',').map(Number);
    const n = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    const exposed = n.some(([a, b, c]) => !vox.has(key(i + a, j + b, k + c)));
    if (exposed || j === 0) out.set(kk, col);
  }
  return out;
}

// Greedy packing of each layer into real brick sizes. Alternating preference per layer
// staggers the seams like a real build.
const SIZES = [[2, 8], [2, 6], [2, 4], [1, 8], [2, 3], [1, 6], [2, 2], [1, 4], [1, 3], [1, 2], [1, 1]];

export function buildBricks() {
  const { vox: full, key } = buildVoxels();
  const vox = shell(full, key);
  const bricks = [];
  const layers = new Map();
  for (const [kk, col] of vox) {
    const [i, j, k] = kk.split(',').map(Number);
    if (!layers.has(j)) layers.set(j, new Map());
    layers.get(j).set(`${i},${k}`, col);
  }
  for (const [j, cells] of [...layers].sort((a, b) => a[0] - b[0])) {
    const used = new Set();
    const coords = [...cells.keys()].map(s => s.split(',').map(Number));
    const flip = j % 2 === 1;
    coords.sort((a, b) => flip ? (a[1] - b[1] || a[0] - b[0]) : (a[0] - b[0] || a[1] - b[1]));
    for (const [i, k] of coords) {
      const c0 = `${i},${k}`;
      if (used.has(c0)) continue;
      const col = cells.get(c0);
      let best = null;
      for (const [a, b] of SIZES) {
        const orients = flip ? [[b, a], [a, b]] : [[a, b], [b, a]];
        for (const [w, d] of orients) {
          let ok = true;
          for (let u = 0; u < w && ok; u++) for (let v = 0; v < d && ok; v++) {
            const c = `${i + u},${k + v}`;
            if (used.has(c) || cells.get(c) !== col) ok = false;
          }
          if (ok) { best = [w, d]; break; }
        }
        if (best) break;
      }
      const [w, d] = best;
      for (let u = 0; u < w; u++) for (let v = 0; v < d; v++) used.add(`${i + u},${k + v}`);
      bricks.push({ layer: j, i, k, w, d, color: col,
        x: i + w / 2, z: k + d / 2, y: j * LAYER_H });
    }
  }
  return bricks;
}
