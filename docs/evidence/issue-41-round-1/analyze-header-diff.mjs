// Scoped visual workaround for kit gap #48.
// The kit's evaluate-visual-diff.ts cannot clip to a selector (no --selector
// support) and cannot click, so it cannot compare a clipped element region.
// This script performs the scoped comparison the factory flow needs, using the
// same dependency family the kit uses (pngjs). Method is stated explicitly so
// the comparison is auditable and never claims pixelmatch-level semantics.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

const require = createRequire("/home/ajosecortes/.hermes/hermes-agent/");
const { PNG } = require("pngjs");

const DIR = "/tmp/opencode/evidence-41";
const load = (p) => PNG.sync.read(readFileSync(`${DIR}/${p}`));

function pixels(png) {
  const out = [];
  for (let i = 0; i < png.data.length; i += 4) {
    out.push([png.data[i], png.data[i + 1], png.data[i + 2]]);
  }
  return out;
}

function modalColor(px) {
  const counts = new Map();
  for (const [r, g, b] of px) {
    const k = `${r},${g},${b}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best = null;
  let bestN = -1;
  for (const [k, n] of counts)
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  return { color: best, count: bestN, unique: counts.size };
}

// "Ink" = a pixel at Manhattan distance > 12 from the modal background color.
function inkProfile(png) {
  const px = pixels(png);
  const bg = modalColor(px).color.split(",").map(Number);
  const cols = new Array(png.width).fill(0);
  let ink = 0;
  let minX = Infinity,
    maxX = -1,
    minY = Infinity,
    maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const [r, g, b] = px[y * png.width + x];
      const d = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
      if (d > 12) {
        ink++;
        cols[x]++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    px,
    bg,
    cols,
    ink,
    bbox: maxX < 0 ? null : { minX, maxX, minY, maxY },
    total: png.width * png.height,
  };
}

function analyze(name) {
  const png = load(name);
  const m = modalColor(pixels(png));
  const ink = inkProfile(png);
  // column runs where ink > 0 (contiguous content bands)
  const bands = [];
  let start = null;
  for (let x = 0; x < png.width; x++) {
    if (ink.cols[x] > 0 && start === null) start = x;
    if (ink.cols[x] === 0 && start !== null) {
      bands.push([start, x - 1]);
      start = null;
    }
  }
  if (start !== null) bands.push([start, png.width - 1]);
  return {
    file: name,
    width: png.width,
    height: png.height,
    backgroundColor: m.color,
    uniqueColors: m.unique,
    backgroundPixelShare: +(m.count / (png.width * png.height)).toFixed(4),
    inkPixels: ink.ink,
    inkShare: +(ink.ink / (png.width * png.height)).toFixed(4),
    inkBBox: ink.bbox,
    contentBandsX: bands,
  };
}

function diff(aName, bName, outName, threshold = 12) {
  const a = load(aName),
    b = load(bName);
  if (a.width !== b.width || a.height !== b.height) {
    return {
      error: "dimension-mismatch",
      a: [a.width, a.height],
      b: [b.width, b.height],
    };
  }
  const out = new PNG({ width: a.width, height: a.height });
  const cols = new Array(a.width).fill(0);
  let diffPixels = 0;
  let minX = Infinity,
    maxX = -1,
    minY = Infinity,
    maxY = -1;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      const dr = Math.abs(a.data[i] - b.data[i]);
      const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
      const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
      const d = dr + dg + db;
      const o = i;
      if (d > threshold) {
        diffPixels++;
        cols[x]++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        out.data[o] = 220;
        out.data[o + 1] = 0;
        out.data[o + 2] = 0;
        out.data[o + 3] = 255;
      } else {
        out.data[o] = 255;
        out.data[o + 1] = 255;
        out.data[o + 2] = 255;
        out.data[o + 3] = 255;
      }
    }
  }
  if (outName) writeFileSync(`${DIR}/${outName}`, PNG.sync.write(out));
  const total = a.width * a.height;
  // bands of differing columns
  const bands = [];
  let s = null;
  for (let x = 0; x < a.width; x++) {
    if (cols[x] > 0 && s === null) s = x;
    if (cols[x] === 0 && s !== null) {
      bands.push([s, x - 1]);
      s = null;
    }
  }
  if (s !== null) bands.push([s, a.width - 1]);
  return {
    a: aName,
    b: bName,
    width: a.width,
    height: a.height,
    diffPixels,
    totalPixels: total,
    diffRatio: +(diffPixels / total).toFixed(4),
    diffBBox: maxX < 0 ? null : { minX, maxX, minY, maxY },
    diffColumnBandsX: bands,
    coordinatesAreClipRelative: true,
  };
}

const results = {
  method:
    "pngjs per-pixel Manhattan RGB distance; ink = >12 from modal background; diff(pixel) = |dR|+|dG|+|dB| > 12. Clip-relative coordinates. Kit gap #48 workaround.",
  images: [
    analyze("base-05735c4-1440x900-header-clip.png"),
    analyze("current-1440x900-header-clip.png"),
  ],
  // Negative control: an image against itself must report zero differences.
  negativeControl: diff(
    "current-1440x900-header-clip.png",
    "current-1440x900-header-clip.png",
    null,
  ),
  // Positive case: the real base vs current scoped header comparison.
  baseVsCurrent: diff(
    "base-05735c4-1440x900-header-clip.png",
    "current-1440x900-header-clip.png",
    "diff-05735c4-vs-69ce1b4-header-clip.png",
  ),
};
console.log(JSON.stringify(results, null, 1));
