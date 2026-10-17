// Reproducible generator for the issue #42 QA (round 1) scoped-visual comparison.
//
// Emits one self-contained HTML page per compared state. Each page draws the
// rendered wireframe reference beside the current capture of the same viewport
// (1440x900), outlines the measured layout regions and marks the intentional
// 40px removal of the drawn title bar (#42). A canvas pass then re-derives the
// region boundaries from the raw pixels, independently of the DOM
// `getBoundingClientRect` values, so the geometry claim does not rest on a
// single measurement source.
//
// Deliberately NOT a pixel-parity gate: the reference draws wireframe content
// (placeholder provider names, drawn suggestions, ~12 rail icons) that the app
// intentionally does not reproduce, and the native OS frame is out of scope by
// issue #42. The comparison is structural + geometric, per the issue #4
// precedent (docs/captures/issue-4/README.md).
//
// Run:  node build-comparison.mjs   (writes comparison-*.html beside this file)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The intentional change (#42): the drawn 40px title bar is gone at HEAD. */
const TITLE_BAR_HEIGHT = 40;

/**
 * Measured `getBoundingClientRect` values, in CSS px at a 1440x900 viewport.
 * Reference values come from the rendered wireframe HTML; current values come
 * from the app at PR HEAD 4c2ba36 (measurements.json beside this file).
 */
const STATES = [
  {
    key: '01-default',
    title: 'State 01 - default (sidebar closed, right panel closed)',
    reference: 'reference-01-home-1440x900.png',
    referenceSource: 'docs/wireframes/01-home.html',
    current: 'current-01-default-closed.png',
    referenceRegions: [
      { name: 'title bar (reference only)', x: 0, y: 0, w: 1440, h: 40, tone: '#d9561e' },
      { name: 'rail', x: 0, y: 40, w: 56, h: 860, tone: '#2f6fed' },
      { name: 'main pane', x: 56, y: 48, w: 1384, h: 848, tone: '#2f6fed' }
    ],
    currentRegions: [
      { name: 'rail', x: 0, y: 0, w: 56, h: 900, tone: '#2f6fed' },
      { name: 'main pane', x: 56, y: 8, w: 1384, h: 888, tone: '#2f6fed' }
    ]
  },
  {
    key: '02-sidebar',
    title: 'State 02 - sidebar open (right panel closed)',
    reference: 'reference-02-home-sidebar-1440x900.png',
    referenceSource: 'docs/wireframes/02-home-sidebar.html',
    current: 'current-02-sidebar-open.png',
    referenceRegions: [
      { name: 'title bar (reference only)', x: 0, y: 0, w: 1440, h: 40, tone: '#d9561e' },
      { name: 'rail', x: 0, y: 40, w: 56, h: 860, tone: '#2f6fed' },
      { name: 'sidebar', x: 56, y: 48, w: 318, h: 852, tone: '#1a8f4a' },
      { name: 'main pane', x: 374, y: 48, w: 1066, h: 852, tone: '#2f6fed' }
    ],
    currentRegions: [
      { name: 'rail', x: 0, y: 0, w: 56, h: 900, tone: '#2f6fed' },
      { name: 'sidebar', x: 56, y: 8, w: 318, h: 892, tone: '#1a8f4a' },
      { name: 'main pane', x: 374, y: 8, w: 1066, h: 888, tone: '#2f6fed' }
    ]
  },
  {
    key: '04-right-panel',
    title: 'State 04 - right panel open (sidebar closed)',
    reference: null,
    current: 'current-04-right-panel-open.png',
    currentRegions: [
      { name: 'rail', x: 0, y: 0, w: 56, h: 900, tone: '#2f6fed' },
      { name: 'main pane', x: 56, y: 8, w: 924, h: 888, tone: '#2f6fed' },
      { name: 'right panel', x: 980, y: 8, w: 460, h: 892, tone: '#8b2fd9' }
    ]
  },
  {
    key: '03-both',
    title: 'State 03 - sidebar and right panel both open',
    reference: null,
    current: 'current-03-sidebar-and-right-open.png',
    currentRegions: [
      { name: 'rail', x: 0, y: 0, w: 56, h: 900, tone: '#2f6fed' },
      { name: 'sidebar', x: 56, y: 8, w: 318, h: 892, tone: '#1a8f4a' },
      { name: 'main pane', x: 374, y: 8, w: 606, h: 888, tone: '#2f6fed' },
      { name: 'right panel', x: 980, y: 8, w: 460, h: 892, tone: '#8b2fd9' }
    ]
  }
];

const page = state => {
  const currentOnly = !state.reference;
  const intro = currentOnly
    ? `CURRENT ONLY - no wireframe reference draws this state. The wireframes draw the right panel
  only inside the chat screens (<code>03</code>, <code>13</code>, <code>18</code>), so states 03/04 are
  current-state functional + geometry checks, <b>not</b> reference parity.`
    : `Reference: <code>${state.referenceSource}</code> rendered at 1440x900.
  <b>Orange band</b> = the drawn 40px title bar the wireframe draws and #42 removes (OS chrome, out of scope).`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>QA #42 round 1 - comparison ${state.key}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #101014; color: #f2f2f4;
         font: 13px/1.45 Inter, 'Segoe UI', system-ui, sans-serif; }
  h1 { font-size: 18px; margin: 14px 20px 6px; }
  .note { margin: 0 20px 12px; color: #b9b9c4; max-width: 2400px; }
  .row { display: flex; gap: 20px; align-items: flex-start; padding: 0 20px 12px; }
  figure { margin: 0; }
  figcaption { padding: 6px 2px 4px; color: #d5d5dd; }
  canvas { display: block; border: 1px solid #3a3a44; background: #fff; }
  .metrics { margin: 4px 20px 24px; padding: 12px 16px; background: #1b1b22;
             border: 1px solid #33333d; border-radius: 8px; max-width: 2400px;
             font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
             white-space: pre-wrap; }
</style>
</head>
<body>
<h1>Issue #42 QA round 1 (scoped-visual) - ${state.title}</h1>
<p class="note">
  Current: PR #46 HEAD <code>4c2ba36</code> at 1440x900 (app content only; OS chrome excluded).
  ${intro}
  Region outlines come from measured <code>getBoundingClientRect</code>; the metrics block below
  re-derives the boundaries from raw pixels as an independent cross-check.
</p>
<div class="row">
${currentOnly ? '' : `  <figure><figcaption>REFERENCE - rendered wireframe</figcaption>
    <canvas id="ref" width="1440" height="900"></canvas></figure>
`}  <figure><figcaption>CURRENT - app at 4c2ba36</figcaption>
    <canvas id="cur" width="1440" height="900"></canvas></figure>
</div>
<div class="metrics" id="metrics">measuring...</div>
<script>
const STATE = ${JSON.stringify(state)};
const CURRENT_ONLY = ${currentOnly};
const TITLE_BAR_HEIGHT = ${TITLE_BAR_HEIGHT};
const BG = [247, 247, 248];
const PANEL = [255, 255, 255];

function load(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('failed to load ' + src));
    img.src = src;
  });
}

function drawRegions(ctx, regions) {
  for (const r of regions) {
    ctx.save();
    ctx.strokeStyle = r.tone;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.setLineDash([]);
    ctx.font = 'bold 13px ui-monospace, monospace';
    const label = r.name + '  ' + r.w + 'x' + r.h + ' @(' + r.x + ',' + r.y + ')';
    const tw = ctx.measureText(label).width;
    const ly = Math.max(r.y + 16, 18);
    ctx.fillStyle = 'rgba(16,16,20,.82)';
    ctx.fillRect(r.x + 4, ly - 13, tw + 8, 18);
    ctx.fillStyle = r.tone;
    ctx.fillText(label, r.x + 8, ly);
    ctx.restore();
  }
}

function near(data, i, rgb, tol) {
  return Math.abs(data[i] - rgb[0]) <= tol && Math.abs(data[i + 1] - rgb[1]) <= tol && Math.abs(data[i + 2] - rgb[2]) <= tol;
}

function fraction(data, w, x0, x1, y0, y1, rgb, stepX, stepY, tol) {
  let hit = 0, tot = 0;
  for (let y = y0; y < y1; y += stepY) {
    for (let x = x0; x < x1; x += stepX) {
      const i = (y * w + x) * 4;
      tot++;
      if (near(data, i, rgb, tol)) hit++;
    }
  }
  return tot ? hit / tot : 0;
}

/** First x whose column is panel-white for the next 24 columns: the rail | surface boundary. */
function firstPanelColumn(data, w, y0, y1, from, to) {
  for (let x = from; x <= to; x++) {
    let ok = true;
    for (let k = 0; k < 24 && ok; k++) {
      if (fraction(data, w, x + k, x + k + 1, y0, y1, PANEL, 1, 4, 3) < 0.9) ok = false;
    }
    if (ok) return x;
  }
  return null;
}

/** First y whose row is panel-white across the pane: the region top inset. */
function firstPanelRow(data, w, x0, x1, from, to) {
  for (let y = from; y <= to; y++) {
    if (fraction(data, w, x0, x1, y, y + 1, PANEL, 6, 1, 3) >= 0.9) return y;
  }
  return null;
}

/** Image-derived region measurements, independent of getBoundingClientRect. */
function measure(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const w = canvas.width;
  return {
    railBgFraction: +fraction(data, w, 10, 46, 300, 780, BG, 3, 5, 6).toFixed(4),
    firstPanelColumnX: firstPanelColumn(data, w, 100, 860, 20, 200),
    firstPanelRowY: firstPanelRow(data, w, 8, 1432, 0, 200)
  };
}

(async () => {
 try {
  const refC = document.getElementById('ref');
  const curC = document.getElementById('cur');
  const curImg = await load(STATE.current);
  curC.getContext('2d').drawImage(curImg, 0, 0);
  let refImg = null;
  if (!CURRENT_ONLY) {
    refImg = await load(STATE.reference);
    refC.getContext('2d').drawImage(refImg, 0, 0);
  }

  // Measure raw pixels BEFORE the annotation overlays are drawn.
  const curM = measure(curC);
  const refM = refImg ? measure(refC) : null;

  if (refImg) drawRegions(refC.getContext('2d'), STATE.referenceRegions);
  drawRegions(curC.getContext('2d'), STATE.currentRegions);

  const report = {
    state: STATE.key,
    referenceImage: STATE.reference || null,
    currentImage: STATE.current,
    referenceRender: refImg ? { width: refImg.naturalWidth, height: refImg.naturalHeight } : null,
    currentCapture: { width: curImg.naturalWidth, height: curImg.naturalHeight },
    titleBarHeightRemoved: CURRENT_ONLY ? null : TITLE_BAR_HEIGHT,
    imageDerived: { current: curM, reference: refM }
  };
  const lines = [
    'viewport: 1440x900   capture mode: viewport   OS chrome: excluded (issue #42)',
    'images: reference=' + (refImg ? refImg.naturalWidth + 'x' + refImg.naturalHeight : 'none') +
      '  current=' + curImg.naturalWidth + 'x' + curImg.naturalHeight,
    'current regions (measured): ' + STATE.currentRegions.map(r => r.name + '=' + r.w + 'x' + r.h + '@(' + r.x + ',' + r.y + ')').join('  ')
  ];
  if (refImg) {
    lines.push(
      'reference regions (measured): ' + STATE.referenceRegions.map(r => r.name + '=' + r.w + 'x' + r.h + '@(' + r.x + ',' + r.y + ')').join('  '),
      'rail band (x 10..46, y 120..780) window-bg fraction:  reference=' + refM.railBgFraction + '  current=' + curM.railBgFraction,
      'IMAGE-DERIVED first panel-white row y:  reference=' + refM.firstPanelRowY + '  current=' + curM.firstPanelRowY +
        '  -> delta ' + (refM.firstPanelRowY - curM.firstPanelRowY) + 'px (intentional 40px title-bar removal)',
      'IMAGE-DERIVED first panel-white column x:  reference=' + refM.firstPanelColumnX + '  current=' + curM.firstPanelColumnX
    );
  } else {
    lines.push('no wireframe reference draws this state: current-state functional + geometry check only');
  }
  document.getElementById('metrics').textContent = lines.join('\\n');
  window.REPORT = report;
 } catch (e) {
  window.REPORT = { state: STATE.key, error: String(e) };
  document.getElementById('metrics').textContent = 'ERROR: ' + String(e);
 }
})();
</script>
</body>
</html>`;
};

for (const state of STATES) {
  const file = join(here, `comparison-${state.key}.html`);
  writeFileSync(file, page(state));
  console.log('wrote', file);
}
