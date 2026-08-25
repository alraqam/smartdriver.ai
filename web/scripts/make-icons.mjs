// Generates the PWA icon set into web/public/icons/.
//
// The icons are committed — this script exists so they are reproducible rather
// than mystery binaries, and so the mark can be re-cut when the accents change.
// Run it with: node scripts/make-icons.mjs
//
// It writes PNGs by hand (zlib is in Node's standard library) because pulling
// in a rasteriser for four flat images would be the single largest dependency
// in a frontend that currently has three.
//
// The mark is the app's own metaphor: the winding road, white on the accent
// gradient that the sidebar logo and every progress bar already use.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const ACCENT_A = [0x3a, 0xa2, 0xff];
const ACCENT_B = [0xe3, 0x90, 0x16];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/// Coverage ramp across one pixel of edge, so the curves are not stair-steps.
function coverage(distance, radius, feather) {
  return clamp01((radius - distance) / feather + 0.5);
}

/// Signed distance to a rounded rectangle centred in an N-box.
function roundedRectDistance(x, y, N, inset, radius) {
  const half = N / 2 - inset;
  const dx = Math.abs(x - N / 2) - (half - radius);
  const dy = Math.abs(y - N / 2) - (half - radius);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0) - radius;
}

/// The road: a serpentine sampled densely, then measured by nearest approach.
/// Two swings, matching the shape of the road the home screen actually draws.
function roadSamples(N, pad) {
  const pts = [];
  const top = pad;
  const bottom = N - pad;
  const amp = N * 0.19;
  const steps = 260;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({
      x: N / 2 + Math.sin(t * Math.PI * 2 - Math.PI / 2) * -amp,
      y: lerp(top, bottom, t),
      t,
    });
  }
  return pts;
}

function nearest(pts, x, y) {
  let best = Infinity;
  let bestT = 0;
  for (const p of pts) {
    const dx = x - p.x;
    const dy = y - p.y;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      bestT = p.t;
    }
  }
  return { d: Math.sqrt(best), t: bestT };
}

/// @param maskable  full-bleed square with the mark inside the 80% safe zone,
///                  for Android's adaptive-icon crop.
/// @param opaque    no transparent corners — iOS applies its own mask and
///                  renders transparency as black.
function render(N, { maskable = false, opaque = false } = {}) {
  const px = Buffer.alloc(N * N * 4);
  const feather = Math.max(1, N / 256);

  // Maskable icons must survive a circular crop, so the art shrinks rather
  // than the canvas growing.
  const safe = maskable ? N * 0.1 : 0;
  const radius = maskable || opaque ? 0 : N * 0.22;
  const inset = maskable || opaque ? 0 : N * 0.02;

  const roadPad = safe + (N - safe * 2) * 0.17;
  const pts = roadSamples(N, roadPad);
  const roadW = (N - safe * 2) * 0.115;
  const dashW = roadW * 0.13;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;

      // Plate: the accent gradient, on the same 135° diagonal as the sidebar
      // logo and the readiness bars.
      //
      // Straight interpolation from blue to amber spends the middle of the
      // canvas passing through grey, which is invisible on a 40px sidebar chip
      // but reads as drab at 512. So the blend is pushed into the far corner
      // and smoothed: mostly brand blue, warming late.
      const diag = clamp01((cx / N + cy / N) / 2);
      const s = clamp01((diag - 0.5) / 0.5);
      const g = s * s * (3 - 2 * s);
      let r = lerp(ACCENT_A[0], ACCENT_B[0], g);
      let gr = lerp(ACCENT_A[1], ACCENT_B[1], g);
      let b = lerp(ACCENT_A[2], ACCENT_B[2], g);

      const plate = radius > 0
        ? coverage(roundedRectDistance(cx, cy, N, inset, radius), 0, feather)
        : 1;

      // Road, white, with the plate colour punched back through as the centre
      // dashes — the same dashed line the home screen draws in yellow.
      const { d, t } = nearest(pts, cx, cy);
      const onRoad = coverage(d, roadW / 2, feather);
      const dashOn = Math.floor(t * 15) % 2 === 0 ? 1 : 0;
      const onDash = dashOn * coverage(d, dashW / 2, feather);
      const ink = clamp01(onRoad - onDash);

      r = lerp(r, 255, ink);
      gr = lerp(gr, 255, ink);
      b = lerp(b, 255, ink);

      const i = (y * N + x) * 4;
      px[i] = Math.round(r);
      px[i + 1] = Math.round(gr);
      px[i + 2] = Math.round(b);
      px[i + 3] = Math.round(255 * (opaque ? 1 : plate));
    }
  }
  return px;
}

// --- minimal PNG writer -----------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // One filter byte (0 = None) per scanline. The art is smooth gradients, so
  // fancier filters would buy very little for a lot more code.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- go ---------------------------------------------------------------------

const TARGETS = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true, opaque: true }],
  ['apple-touch-icon.png', 180, { opaque: true }],
  ['favicon-32.png', 32, {}],
];

mkdirSync(OUT, { recursive: true });
for (const [name, size, opts] of TARGETS) {
  const buf = png(size, size, render(size, opts));
  writeFileSync(join(OUT, name), buf);
  console.log(`${name}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)} kB`);
}
