#!/usr/bin/env node
// Regenerates expo/assets/{icon,adaptive-icon,splash-icon}.png from the web
// app's logo.
//
// Why a script and not three files someone exported by hand: the real store
// icon is still coming (board card 6ab02832). When it lands, drop it in as the
// SOURCE below, re-run this, and the three assets stay in step with each other
// — same artwork, same safe margins, same background. Until then
// `webapp/public/logo.png` is the stand-in, which is the same mark the PWA
// installs with, so the phone icon and the browser icon already match.
//
//   node scripts/generate-app-assets.mjs
//
// It has no dependencies on purpose. `sharp` needs a native binary, and the
// three PNGs this writes are 8-bit non-interlaced — a decoder and an encoder
// for exactly that are ~150 lines of zlib, which is cheaper than a native
// module that has to install on every machine that ever touches the icons.
//
// The artwork: the source is a white-on-near-black lockup (triangle mark above
// the BECOME wordmark). We take the MARK only — a wordmark is illegible at
// 60 px on a home screen and gets cropped by Android's circular launcher mask
// and by the Android 12+ splash mask. The mark is unsaturated, so it survives
// as a single alpha channel painted #ffffff, which also throws away the
// source's compression noise.

import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPO_DIR = join(HERE, "..");
const SOURCE = join(EXPO_DIR, "..", "webapp", "public", "logo.png");
const OUT_DIR = join(EXPO_DIR, "assets");

/** The app's first paint (`app/_layout.tsx` Stack contentStyle). Everything
 *  that can show before it — the splash, the adaptive-icon background — is
 *  this exact colour, which is what makes the launch flash-free. */
const BACKGROUND = [0x0a, 0x0a, 0x0a];

/** First row of the BECOME wordmark in the source lockup: everything above it
 *  is the mark. Re-measure if SOURCE is replaced by a different lockup. */
const WORDMARK_TOP_ROW = 439;

/** Luminance -> alpha ramp. Below FLOOR is the source's near-black background
 *  (and its noise) and becomes fully transparent; above CEIL is the solid
 *  white of the mark. */
const ALPHA_FLOOR = 18;
const ALPHA_CEIL = 230;

const CANVAS = 1024;

/** Fraction of the canvas the mark spans, per asset.
 *  - icon: an iOS/legacy-Android icon is not masked beyond rounded corners.
 *  - adaptive-icon: Android keeps only the centre ~66% of the foreground
 *    (circle, squircle, teardrop...), so stay well inside it.
 *  - splash-icon: Android 12+ masks the splash icon to a circle too. */
const MARK_FRACTION = {
  "icon.png": 0.56,
  "adaptive-icon.png": 0.5,
  "splash-icon.png": 0.58,
};

// ─── PNG decode ──────────────────────────────────────────────────────────────

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("not a PNG");
  }
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (!header) throw new Error("PNG has no IHDR");
  if (header.bitDepth !== 8 || header.interlace !== 0) {
    throw new Error(
      `only 8-bit non-interlaced PNGs are supported (got bitDepth=${header.bitDepth}, interlace=${header.interlace})`,
    );
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[header.colorType];
  if (!channels) {
    throw new Error(`unsupported colorType ${header.colorType} (palettes?)`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const { width, height } = header;
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y === 0 ? null : pixels.subarray((y - 1) * stride, y * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      const x = line[i];
      switch (filter) {
        case 0:
          out[i] = x;
          break;
        case 1:
          out[i] = (x + a) & 0xff;
          break;
        case 2:
          out[i] = (x + b) & 0xff;
          break;
        case 3:
          out[i] = (x + ((a + b) >> 1)) & 0xff;
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          out[i] = (x + pred) & 0xff;
          break;
        }
        default:
          throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      }
    }
  }
  return { width, height, channels, pixels };
}

// ─── PNG encode ──────────────────────────────────────────────────────────────

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
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** @param {{width:number,height:number,channels:number,pixels:Buffer}} image */
function encodePng(image) {
  const { width, height, channels, pixels } = image;
  const colorType = channels === 4 ? 6 : 2;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─── Resampling (Catmull-Rom, separable, scale-aware support) ────────────────

function catmullRom(x) {
  const t = Math.abs(x);
  if (t < 1) return 1.5 * t * t * t - 2.5 * t * t + 1;
  if (t < 2) return -0.5 * t * t * t + 2.5 * t * t - 4 * t + 2;
  return 0;
}

function weights(srcLen, dstLen) {
  const scale = dstLen / srcLen;
  const filterScale = scale < 1 ? 1 / scale : 1;
  const support = 2 * filterScale;
  const rows = [];
  for (let i = 0; i < dstLen; i++) {
    const center = (i + 0.5) / scale - 0.5;
    const from = Math.max(0, Math.ceil(center - support));
    const to = Math.min(srcLen - 1, Math.floor(center + support));
    const idx = [];
    const w = [];
    let sum = 0;
    for (let j = from; j <= to; j++) {
      const t = catmullRom((j - center) / filterScale);
      if (t === 0) continue;
      idx.push(j);
      w.push(t);
      sum += t;
    }
    if (sum === 0) {
      idx.push(Math.min(srcLen - 1, Math.max(0, Math.round(center))));
      w.push(1);
      sum = 1;
    }
    for (let k = 0; k < w.length; k++) w[k] /= sum;
    rows.push({ idx, w });
  }
  return rows;
}

/** Resize one Float32 channel. */
function resize(src, srcW, srcH, dstW, dstH) {
  const horizontal = weights(srcW, dstW);
  const mid = new Float32Array(dstW * srcH);
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < dstW; x++) {
      const { idx, w } = horizontal[x];
      let acc = 0;
      for (let k = 0; k < idx.length; k++) acc += src[y * srcW + idx[k]] * w[k];
      mid[y * dstW + x] = acc;
    }
  }
  const vertical = weights(srcH, dstH);
  const out = new Float32Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const { idx, w } = vertical[y];
    for (let x = 0; x < dstW; x++) {
      let acc = 0;
      for (let k = 0; k < idx.length; k++) acc += mid[idx[k] * dstW + x] * w[k];
      out[y * dstW + x] = Math.min(1, Math.max(0, acc));
    }
  }
  return out;
}

// ─── The mark ────────────────────────────────────────────────────────────────

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Crop the mark out of the lockup and turn it into a single alpha channel. */
function extractMark(image) {
  const { width, channels, pixels } = image;
  const at = (x, y) => {
    const i = (y * width + x) * channels;
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  };

  let minX = width;
  let maxX = -1;
  let minY = WORDMARK_TOP_ROW;
  let maxY = -1;
  let saturationSum = 0;
  let saturationCount = 0;
  for (let y = 0; y < WORDMARK_TOP_ROW; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = at(x, y);
      if (luminance(r, g, b) <= ALPHA_FLOOR + 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const hi = Math.max(r, g, b);
      const lo = Math.min(r, g, b);
      if (hi > 60) {
        saturationSum += (hi - lo) / hi;
        saturationCount++;
      }
    }
  }
  if (maxX < 0 || maxY < 0) {
    throw new Error("found no mark above the wordmark — is SOURCE still the lockup?");
  }
  const meanSaturation = saturationSum / Math.max(saturationCount, 1);
  if (meanSaturation > 0.08) {
    throw new Error(
      `the mark is coloured (mean saturation ${meanSaturation.toFixed(3)}); this script flattens it to white — teach it about colour before re-running`,
    );
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const aspect = w / h;
  if (aspect < 0.4 || aspect > 2.5) {
    throw new Error(`mark crop looks wrong: ${w}x${h}`);
  }

  const alpha = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = at(minX + x, minY + y);
      const l = luminance(r, g, b);
      alpha[y * w + x] = Math.min(
        1,
        Math.max(0, (l - ALPHA_FLOOR) / (ALPHA_CEIL - ALPHA_FLOOR)),
      );
    }
  }
  return { alpha, width: w, height: h, meanSaturation };
}

/** Paint the mark white, centred, on `background` (null = transparent). */
function compose(mark, size, fraction, background) {
  const scale = (size * fraction) / Math.max(mark.width, mark.height);
  const dstW = Math.max(1, Math.round(mark.width * scale));
  const dstH = Math.max(1, Math.round(mark.height * scale));
  const scaled = resize(mark.alpha, mark.width, mark.height, dstW, dstH);
  const offsetX = Math.round((size - dstW) / 2);
  const offsetY = Math.round((size - dstH) / 2);

  const channels = background ? 3 : 4;
  const pixels = Buffer.alloc(size * size * channels);
  if (background) {
    for (let i = 0; i < size * size; i++) {
      pixels[i * 3] = background[0];
      pixels[i * 3 + 1] = background[1];
      pixels[i * 3 + 2] = background[2];
    }
  }
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const a = scaled[y * dstW + x];
      if (a <= 0) continue;
      const i = ((offsetY + y) * size + offsetX + x) * channels;
      if (background) {
        // Opaque icon: composite white over the background colour. No alpha
        // channel at all — an App Store icon with one is rejected.
        for (let c = 0; c < 3; c++) {
          pixels[i + c] = Math.round(background[c] * (1 - a) + 255 * a);
        }
      } else {
        pixels[i] = 255;
        pixels[i + 1] = 255;
        pixels[i + 2] = 255;
        pixels[i + 3] = Math.round(a * 255);
      }
    }
  }
  return { width: size, height: size, channels, pixels };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const source = decodePng(readFileSync(SOURCE));
const mark = extractMark(source);
mkdirSync(OUT_DIR, { recursive: true });

const written = [];
for (const [name, fraction] of Object.entries(MARK_FRACTION)) {
  const opaque = name === "icon.png";
  const image = compose(mark, CANVAS, fraction, opaque ? BACKGROUND : null);
  const bytes = encodePng(image);
  writeFileSync(join(OUT_DIR, name), bytes);
  written.push(
    `${name.padEnd(18)} ${image.width}x${image.height} ${opaque ? "opaque RGB" : "RGBA"} ${(bytes.length / 1024).toFixed(1)} kB`,
  );
}

console.log(
  [
    `source            ${SOURCE}`,
    `mark              ${mark.width}x${mark.height} (mean saturation ${mark.meanSaturation.toFixed(3)})`,
    ...written,
  ].join("\n"),
);
