// Reproducible generator for the issue #43 QA (round 1) visual comparison pages.
//
// The issue declares this ticket as the one that ESTABLISHES the baselines below
// 1440x900, and explicitly records that the companion `evaluate-visual-diff.ts`
// cannot drive a UI state or clip the current side. So this generator does not
// fake a pixel-parity gate: it emits structural + geometric comparison pages
// (region rectangles measured from the live DOM, overlaid on the raw captures)
// and, at the one size a wireframe exists (1440x900), a reference-vs-current
// side-by-side page.
//
// Run:  node build-comparison.mjs
// Inputs: measurements/<W>x<H>-home-<state>.json  (raw agent-browser DOM probe)
//         reference-01-home-1440x900.png / reference-02-home-sidebar-1440x900.png
//         current-<W>x<H>-home-<state>.png
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SIZES = [
  [900, 700],
  [1000, 720],
  [1200, 800],
  [1440, 900]
];
const STATES = [
  ['s0p0', 'both regions closed'],
  ['s1p0', 'sidebar open'],
  ['s0p1', 'right panel open'],
  ['s1p1', 'both regions open']
];
const TONE = { rail: '#2f6fed', sidebar: '#1a8f4a', rightPanel: '#8b2fd9', dock: '#d9561e' };

function load(w, h, state) {
  return JSON.parse(
    readFileSync(join(here, 'measurements', `${w}x${h}-${state}.json`), 'utf8')
  );
}

function regionsOf(m) {
  const out = [];
  if (m.rail) out.push({ name: 'rail', tone: TONE.rail, ...m.rail });
  if (m.sidebar && m.sidebar.present) out.push({ name: `sidebar (${m.sidebar.position})`, tone: TONE.sidebar, ...m.sidebar.rect });
  if (m.rightPanel && !m.rightPanel.hidden) out.push({ name: `right panel (${m.rightPanel.position})`, tone: TONE.rightPanel, ...m.rightPanel.rect });
  if (m.dock && m.dock.rect) out.push({ name: 'composer dock', tone: TONE.dock, ...m.dock.rect });
  return out;
}

function overlay(regions) {
  return regions
    .map(
      r =>
        `<div class="reg" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;border-color:${r.tone}"><span style="background:${r.tone}">${r.name} ${r.w}x${r.h} @ ${r.x},${r.y}</span></div>`
    )
    .join('\n');
}

const CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef0f4; color: #111; font: 13px/1.4 Inter, system-ui, sans-serif; }
  h1 { font-size: 18px; margin: 16px 20px 4px; }
  h2 { font-size: 14px; margin: 18px 20px 6px; color: #333; }
  .meta { margin: 0 20px 10px; color: #555; max-width: 1400px; }
  .row { display: flex; gap: 20px; padding: 0 20px 18px; flex-wrap: wrap; }
  .panel { position: relative; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.18); }
  .panel > img { display: block; }
  .panel > .cap { position: absolute; left: 0; top: -20px; font-weight: 600; color: #222; }
  .reg { position: absolute; border: 2px solid; pointer-events: none; }
  .reg > span { position: absolute; top: 0; left: 0; color: #fff; font-size: 10px; padding: 1px 4px; white-space: nowrap; }
  .plus { align-self: center; font-size: 28px; color: #888; }
`;

function page(title, blocks) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body><h1>${title}</h1>${blocks}</body></html>`;
}

function panel(caption, img, regions, w, h) {
  return `<div class="panel" style="width:${w}px;height:${h}px"><div class="cap">${caption}</div><img src="${img}" width="${w}" height="${h}">${overlay(regions)}</div>`;
}

// --- Page A: 1440x900 reference vs current (the one size a wireframe draws) ---
{
  const ref01 = load(1440, 900, 's0p0');
  const ref02 = load(1440, 900, 's1p0');
  const blocks = `
    <h2>Home, both regions closed — wireframe 01 vs app at 1440x900</h2>
    <div class="row">
      ${panel('reference: docs/wireframes/01-home.html', 'reference-01-home-1440x900.png', [], 1440, 900)}
      <div class="plus">&rarr;</div>
      ${panel('current: app / (PR HEAD)', 'current-1440x900-home-s0p0.png', regionsOf(ref01), 1440, 900)}
    </div>
    <div class="meta">The reference draws a 40px title bar and placeholder content the app intentionally does not reproduce (issue #42 removal); region geometry, clipped controls and landmarks are the comparison, not whole-page pixels.</div>
    <h2>Home, sidebar open — wireframe 02 vs app at 1440x900</h2>
    <div class="row">
      ${panel('reference: docs/wireframes/02-home-sidebar.html', 'reference-02-home-sidebar-1440x900.png', [], 1440, 900)}
      <div class="plus">&rarr;</div>
      ${panel('current: app / (PR HEAD)', 'current-1440x900-home-s1p0.png', regionsOf(ref02), 1440, 900)}
    </div>`;
  writeFileSync(join(here, 'comparison-1440x900.html'), page('Issue #43 — 1440x900 reference vs current', blocks));
}

// --- Page B: every viewport, all four region states, annotated ---
{
  let blocks = '<div class="meta">Reference below 1440x900: the maintainer-approved structure (comment 6242046193) — rail 56 + sidebar 318 + right panel 460, panel overlays first, sidebar collapses second. This is a NEW baseline established by this ticket, not an independent pixel-parity oracle.</div>';
  for (const [w, h] of SIZES) {
    blocks += `<h2>${w}x${h} — home, four region states with measured rectangles</h2><div class="row">`;
    for (const [st, label] of STATES) {
      const m = load(w, h, st);
      blocks += panel(`${label} — overflow ${m.docOverflow.x},${m.docOverflow.y}, send hit ${m.send.hit}`, `current-${w}x${h}-home-${st}.png`, regionsOf(m), w, h);
    }
    blocks += '</div>';
  }
  writeFileSync(join(here, 'annotated-viewports.html'), page('Issue #43 — measured region geometry at every viewport', blocks));
}
console.log('wrote comparison-1440x900.html and annotated-viewports.html');

// --- Page C: compact 2x2 grid of the decisive state (both regions open) ---
{
  const SCALE = 0.46;
  let cells = '';
  for (const [w, h] of SIZES) {
    const m = load(w, h, 's1p1');
    const sw = Math.round(w * SCALE), sh = Math.round(h * SCALE);
    cells += `<div class="cell"><div class="cap">${w}x${h} — home, both regions open (doc overflow ${m.docOverflow.x},${m.docOverflow.y}; send hit ${m.send.hit})</div>
      <div class="frame" style="width:${sw}px;height:${sh}px"><div class="scaler" style="transform:scale(${SCALE});width:${w}px;height:${h}px">
      <div class="panel" style="width:${w}px;height:${h}px"><img src="current-${w}x${h}-home-s1p1.png" width="${w}" height="${h}">${overlay(regionsOf(m))}</div>
      </div></div></div>`;
  }
  const css = CSS + `\n.grid { display: grid; grid-template-columns: repeat(2, max-content); gap: 28px 36px; padding: 24px 20px; }\n.cell > .cap { font-weight: 600; margin-bottom: 6px; }\n.frame { overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.2); background:#fff; }\n.scaler { transform-origin: top left; }`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Issue #43 — key evidence</title><style>${css}</style></head><body><h1>Issue #43 — every approved viewport, every region open</h1>
  <div class="meta">Rectangles are measured live from the DOM (rail blue, sidebar green, right panel purple, composer dock orange). No document overflow and send hit-tests to itself at every size; the drawers end above the composer dock.</div>
  <div class="grid">${cells}</div></body></html>`;
  writeFileSync(join(here, 'key-evidence-viewports.html'), html);
  console.log('wrote key-evidence-viewports.html');
}
