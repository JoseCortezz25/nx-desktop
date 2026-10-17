#!/usr/bin/env node
// @ts-nocheck
import process from 'node:process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContextOptions } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

type ViewportName = 'desktop' | 'tablet' | 'mobile';

type Viewport = { width: number; height: number };

const DEFAULT_VIEWPORTS: Record<ViewportName, Viewport> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

// Project standard: desktop 1440x900, tablet 768x1024, mobile 390x844.
// The baseline is the source of truth at render time: resolveViewport prefers
// the baseline manifest written by create-visual-baseline.ts, then the
// baseline PNG dimensions, so QA renders at the exact baseline contract size
// instead of guessing viewports. These defaults only describe the standard a
// new baseline should be captured with.
const STANDARD_NOTE =
  'Standard viewports: desktop 1440x900, tablet 768x1024, mobile 390x844.';

function getArg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  return fallback;
}

function parseList(value: string | undefined, fallback: ViewportName[]): ViewportName[] {
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean) as ViewportName[];
}

function parseMasks(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

async function loadPng(filePath: string) {
  return PNG.sync.read(await readFile(filePath));
}

async function resolveViewportFromManifest(
  baselineDir: string,
  name: ViewportName,
): Promise<{ viewport: Viewport; source: string } | null> {
  try {
    const raw = await readFile(join(baselineDir, name, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(raw);
    const width = Number(manifest?.viewport?.width);
    const height = Number(manifest?.viewport?.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { viewport: { width, height }, source: 'baseline-manifest' };
    }
  } catch {
    // No usable manifest — caller falls through to the baseline PNG
    // dimensions, then to the project-standard default.
  }
  return null;
}

async function main() {
  const url = getArg('url');
  const baselineDir = resolve(getArg('baseline', './visual-baseline')!);
  const outDir = resolve(getArg('out', './visual-eval')!);
  const capture = getArg('capture', 'viewport');
  const viewports = parseList(getArg('viewports'), ['desktop', 'mobile', 'tablet']);
  const masks = parseMasks(getArg('mask'));
  const readySelector = getArg('ready-selector');
  const threshold = Number(getArg('threshold', '0.1'));
  const maxDiffPixels = Number(getArg('max-diff-pixels', String(Number.POSITIVE_INFINITY)));
  const maxDiffRatio = Number(getArg('max-diff-ratio', '0.01'));

  if (!url) {
    console.error('Missing --url=<page-url>');
    process.exit(1);
  }

  if (process.argv.includes('--help')) {
    console.log(
      [
        'Usage: evaluate-visual-diff.ts --url=<page-url> [options]',
        '',
        'Options:',
        '  --baseline=<dir>        Baseline directory (default ./visual-baseline).',
        '                          Layout: <dir>/<viewport>/<viewport>.png',
        '  --out=<dir>             Output directory (default ./visual-eval).',
        '  --capture=<mode>        viewport (default) or full-page.',
        '  --viewports=<list>      Explicit comma-separated viewports to evaluate,',
        '                          e.g. --viewports=desktop,mobile. Defaults to',
        '                          desktop,mobile,tablet when omitted.',
        '  --mask=<selectors>      Comma-separated selectors to mask.',
        '  --ready-selector=<sel>  Wait for this selector before capturing.',
        '  --threshold=<n>         pixelmatch threshold (default 0.1).',
        '  --max-diff-pixels=<n>   Fail above this many differing pixels.',
        '  --max-diff-ratio=<n>    Fail above this diff ratio (default 0.01).',
        '',
        STANDARD_NOTE,
        'The baseline is the source of truth: each viewport renders at the',
        'baseline manifest size when present, otherwise at the exact baseline',
        'PNG dimensions. A size difference fails loudly as dimension-mismatch',
        'instead of silently diffing.',
      ].join('\n'),
    );
    return;
  }

  if (!getArg('viewports')) {
    console.log('No --viewports given; evaluating default set: desktop,mobile,tablet.');
  }

  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results: Array<Record<string, unknown>> = [];
  let failed = false;
  const contextOptions: BrowserContextOptions = {
    deviceScaleFactor: 1,
  };

  for (const name of viewports) {
    const baselinePath = join(baselineDir, name, `${name}.png`);
    const viewportDir = join(outDir, name);
    await mkdir(viewportDir, { recursive: true });

    const currentPath = join(viewportDir, `${name}.current.png`);
    const diffPath = join(viewportDir, `${name}.diff.png`);

    // Load the baseline first: its pixels feed the comparison, and its size
    // is the fallback render size when no manifest exists.
    let baseline: PNG;
    try {
      baseline = await loadPng(baselinePath);
    } catch {
      failed = true;
      const message =
        `Missing baseline for viewport "${name}": ${baselinePath} not found. ` +
        `Capture it first (create-visual-baseline.ts --url=<url> --viewports=${name}) ` +
        `or point --baseline=<dir> at the right directory. ${STANDARD_NOTE}`;
      console.error(message);
      results.push({
        viewport: name,
        baseline: baselinePath,
        current: currentPath,
        diff: diffPath,
        diffPixels: 0,
        diffRatio: 1,
        passed: false,
        reason: 'missing-baseline',
      });
      continue;
    }

    // Resolution chain: baseline manifest → baseline PNG dimensions → standard
    // default (assumes deviceScaleFactor 1 on both sides). DEFAULT_VIEWPORTS
    // only describes the standard a new baseline should be captured with — it
    // is never silently imposed over an existing baseline.
    let viewport: Viewport;
    let source: string;
    const fromManifest = await resolveViewportFromManifest(baselineDir, name);
    if (fromManifest) {
      ({ viewport, source } = fromManifest);
      console.log(
        `Viewport "${name}": rendering at ${viewport.width}x${viewport.height} (from ${source}).`,
      );
    } else {
      viewport = { width: baseline.width, height: baseline.height };
      source = 'baseline-png';
      const standard = DEFAULT_VIEWPORTS[name];
      if (standard && (standard.width !== viewport.width || standard.height !== viewport.height)) {
        console.log(
          `Viewport "${name}": rendering at baseline size ${viewport.width}x${viewport.height} ` +
            `(standard is ${standard.width}x${standard.height}).`,
        );
      } else {
        console.log(`Viewport "${name}": rendering at ${viewport.width}x${viewport.height}.`);
      }
    }

    const context = await browser.newContext({
      ...contextOptions,
      viewport,
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'networkidle' });
    if (readySelector) {
      await page.waitForSelector(readySelector, { state: 'visible' });
    }

    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          caret-color: transparent !important;
        }
      `,
    });

    await page.screenshot({
      path: currentPath,
      fullPage: capture === 'full-page',
      animations: 'disabled',
      mask: masks.map((selector) => page.locator(selector)),
    });

    const current = await loadPng(currentPath);

    let diffPixels = 0;
    let diffRatio = 0;
    let passed = false;

    if (baseline.width !== current.width || baseline.height !== current.height) {
      const diff = new PNG({ width: Math.max(baseline.width, current.width), height: Math.max(baseline.height, current.height) });
      await writeFile(diffPath, PNG.sync.write(diff));
      diffPixels = diff.width * diff.height;
      diffRatio = 1;
      passed = false;
      failed = true;
      console.error(
        `Dimension mismatch on "${name}": baseline is ${baseline.width}x${baseline.height} ` +
          `but current rendered at ${current.width}x${current.height}. ` +
          `Compare the same scope at the same viewport (${STANDARD_NOTE}) ` +
          `with the same capture mode (--capture=${capture}), or re-capture the baseline ` +
          `if the layout intentionally changed size.`,
      );
      results.push({
        viewport: name,
        baseline: baselinePath,
        current: currentPath,
        diff: diffPath,
        diffPixels,
        diffRatio,
        passed,
        reason: 'dimension-mismatch',
        baselineSize: { width: baseline.width, height: baseline.height },
        currentSize: { width: current.width, height: current.height },
        viewportSource: source,
        renderedViewport: { width: viewport.width, height: viewport.height },
      });
    } else {
      const diff = new PNG({ width: baseline.width, height: baseline.height });
      diffPixels = pixelmatch(baseline.data, current.data, diff.data, baseline.width, baseline.height, {
        threshold,
        includeAA: true,
      });
      await writeFile(diffPath, PNG.sync.write(diff));
      const totalPixels = baseline.width * baseline.height;
      diffRatio = totalPixels === 0 ? 0 : diffPixels / totalPixels;
      passed = diffPixels <= maxDiffPixels && diffRatio <= maxDiffRatio;
      if (!passed) failed = true;
      results.push({
        viewport: name,
        baseline: baselinePath,
        current: currentPath,
        diff: diffPath,
        diffPixels,
        diffRatio,
        passed,
        viewportSource: source,
      });
    }

    await context.close();
  }

  await browser.close();

  const report = {
    url,
    baselineDir,
    outDir,
    capture,
    viewports,
    masks,
    threshold,
    maxDiffPixels,
    maxDiffRatio,
    passed: !failed,
    results,
    createdAt: new Date().toISOString(),
  };

  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');

  if (!report.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
