// Final scoped-visual report for issue #41 QA.
// Kit gap #48: evaluate-visual-diff.ts has no --selector (cannot clip) and no
// click support, so a clipped header comparison cannot run through it. This is
// the documented scoped workaround: capture both sides as element clips and
// compare the clip PNGs directly. Method is stated so the verdict is auditable.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

const require = createRequire("/home/ajosecortes/.hermes/hermes-agent/");
const { PNG } = require("pngjs");

const DIR = "/tmp/opencode/evidence-41";
const load = (p) => PNG.sync.read(readFileSync(`${DIR}/${p}`));
const pixels = (png) => {
  const o = [];
  for (let i = 0; i < png.data.length; i += 4)
    o.push([png.data[i], png.data[i + 1], png.data[i + 2]]);
  return o;
};

function modal(px) {
  const c = new Map();
  for (const [r, g, b] of px) {
    const k = `${r},${g},${b}`;
    c.set(k, (c.get(k) || 0) + 1);
  }
  let best = null,
    n = -1;
  for (const [k, v] of c)
    if (v > n) {
      best = k;
      n = v;
    }
  return { color: best, count: n, unique: c.size };
}

function analyze(file) {
  const png = load(file);
  const px = pixels(png);
  const m = modal(px);
  const bg = m.color.split(",").map(Number);
  const cols = new Array(png.width).fill(0);
  let ink = 0,
    minX = Infinity,
    maxX = -1,
    minY = Infinity,
    maxY = -1;
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++) {
      const [r, g, b] = px[y * png.width + x];
      if (
        Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) >
        12
      ) {
        ink++;
        cols[x]++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  const bands = [];
  let s = null;
  for (let x = 0; x < png.width; x++) {
    if (cols[x] > 0 && s === null) s = x;
    if (cols[x] === 0 && s !== null) {
      bands.push([s, x - 1]);
      s = null;
    }
  }
  if (s !== null) bands.push([s, png.width - 1]);
  return {
    file,
    width: png.width,
    height: png.height,
    backgroundColor: m.color,
    uniqueColors: m.unique,
    backgroundShare: +(m.count / (png.width * png.height)).toFixed(4),
    inkPixels: ink,
    inkShare: +(ink / (png.width * png.height)).toFixed(4),
    inkBBox: maxX < 0 ? null : { minX, maxX, minY, maxY },
    contentBandsX: bands,
  };
}

function diff(aName, bName, outName, t = 12) {
  const a = load(aName),
    b = load(bName);
  if (a.width !== b.width || a.height !== b.height)
    return {
      error: "dimension-mismatch",
      a: [a.width, a.height],
      b: [b.width, b.height],
    };
  const out = new PNG({ width: a.width, height: a.height });
  const cols = new Array(a.width).fill(0);
  let n = 0,
    minX = Infinity,
    maxX = -1,
    minY = Infinity,
    maxY = -1;
  for (let y = 0; y < a.height; y++)
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      const d =
        Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (d > t) {
        n++;
        cols[x]++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        out.data[i] = 220;
        out.data[i + 1] = 0;
        out.data[i + 2] = 0;
        out.data[i + 3] = 255;
      } else {
        out.data[i] = 255;
        out.data[i + 1] = 255;
        out.data[i + 2] = 255;
        out.data[i + 3] = 255;
      }
    }
  if (outName) writeFileSync(`${DIR}/${outName}`, PNG.sync.write(out));
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
    diffPixels: n,
    totalPixels: a.width * a.height,
    diffRatio: +(n / (a.width * a.height)).toFixed(4),
    diffBBox: maxX < 0 ? null : { minX, maxX, minY, maxY },
    diffColumnBandsX: bands,
  };
}

const report = {
  schema: "fabrica-scoped-visual-report",
  issue: 41,
  pr: 45,
  generatedAt: new Date().toISOString(),
  method:
    "pngjs per-pixel Manhattan RGB distance. ink = distance > 12 from modal background. diff(pixel) = |dR|+|dG|+|dB| > 12. Clip-relative coordinates. Kit gap #48 workaround: evaluate-visual-diff.ts cannot clip or click, so the scoped clip comparison runs here.",
  scope: "sidebar header only (.sidebar__header)",
  route: "home shell (/) with sidebar open; conversation view for regression",
  viewport: { name: "desktop", width: 1440, height: 900 },
  captureMode:
    "clip (.sidebar__header element screenshot, agent-browser 0.26.0)",
  engine: "HeadlessChrome/152.0.0.0 (agent-browser 0.26.0, Chromium via CDP)",
  deviceScaleFactor: 1,
  dynamicAreasIgnored: ["conversation/project rows", "composer"],
  relationshipToIssue4Baseline:
    "The issue #4 app baseline can anchor unchanged header geometry only; its brand text/icons are superseded by #41 and are not used as the text source of truth here.",
  images: [
    analyze("base-05735c4-1440x900-header-clip.png"),
    analyze("current-1440x900-header-clip.png"),
  ],
  controls: {
    negative_same_vs_same: diff(
      "current-1440x900-header-clip.png",
      "current-1440x900-header-clip.png",
      null,
    ),
    positive_base_vs_current: diff(
      "base-05735c4-1440x900-header-clip.png",
      "current-1440x900-header-clip.png",
      "diff-05735c4-vs-69ce1b4-header-clip.png",
    ),
  },
  stateStability: {
    current_home_vs_conversation: diff(
      "current-1440x900-header-clip.png",
      "current-69ce1b4-conversation-header-clip.png",
      null,
    ),
    current_provider_openCode_vs_codex: diff(
      "current-69ce1b4-header-provider-OpenCode.png",
      "current-69ce1b4-header-provider-Codex.png",
      null,
    ),
    current_provider_codex_vs_claude: diff(
      "current-69ce1b4-header-provider-Codex.png",
      "current-69ce1b4-header-provider-Claude.png",
      null,
    ),
  },
};

writeFileSync(`${DIR}/visual-report.json`, JSON.stringify(report, null, 2));
const p = report.controls.positive_base_vs_current;
console.log(
  JSON.stringify(
    {
      baseInk: report.images[0].inkPixels,
      currentInk: report.images[1].inkPixels,
      baseBands: report.images[0].contentBandsX,
      currentBands: report.images[1].contentBandsX,
      negativeDiffPixels: report.controls.negative_same_vs_same.diffPixels,
      positiveDiffPixels: p.diffPixels,
      positiveDiffRatio: p.diffRatio,
      positiveDiffBands: p.diffColumnBandsX,
      homeVsConversationDiff:
        report.stateStability.current_home_vs_conversation.diffPixels,
      providerDiffs: [
        report.stateStability.current_provider_openCode_vs_codex.diffPixels,
        report.stateStability.current_provider_codex_vs_claude.diffPixels,
      ],
    },
    null,
    1,
  ),
);
