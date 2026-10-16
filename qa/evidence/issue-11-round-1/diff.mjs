// Compares the app's conversation region (both sidebar states) against the
// wireframe baseline, at desktop 1440x900, with the same algorithm the skill's
// companion evaluate-visual-diff.ts uses (pixelmatch, threshold 0.1, includeAA).
// The companion cannot drive the app's two UI states, so the current side is
// its own capture; the baseline side is produced by create-visual-baseline.ts.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const threshold = 0.1;

const PAIRS = [
  {
    state: "sidebar-open",
    baseline: "/tmp/opencode/qa/issue-11/baseline-open/desktop/desktop.png",
    current: "/tmp/opencode/qa/issue-11/shots/current-02-open-viewport.png",
    out: "/tmp/opencode/qa/issue-11/eval/sidebar-open.diff.png",
  },
  {
    state: "sidebar-closed",
    baseline: "/tmp/opencode/qa/issue-11/baseline-closed/desktop/desktop.png",
    current: "/tmp/opencode/qa/issue-11/shots/current-06-closed-viewport.png",
    out: "/tmp/opencode/qa/issue-11/eval/sidebar-closed.diff.png",
  },
];

await mkdir("/tmp/opencode/qa/issue-11/eval", { recursive: true });
const results = [];

for (const pair of PAIRS) {
  const baseline = PNG.sync.read(await readFile(pair.baseline));
  const current = PNG.sync.read(await readFile(pair.current));
  if (baseline.width !== current.width || baseline.height !== current.height) {
    console.error(
      `dimension-mismatch ${pair.state}: ${baseline.width}x${baseline.height} vs ${current.width}x${current.height}`,
    );
    process.exit(1);
  }
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const diffPixels = pixelmatch(
    baseline.data,
    current.data,
    diff.data,
    baseline.width,
    baseline.height,
    { threshold, includeAA: true },
  );
  await writeFile(pair.out, PNG.sync.write(diff));
  const total = baseline.width * baseline.height;
  results.push({
    state: pair.state,
    baseline: pair.baseline,
    current: pair.current,
    diff: pair.out,
    size: { width: baseline.width, height: baseline.height },
    diffPixels,
    diffRatio: Number((diffPixels / total).toFixed(4)),
    threshold,
  });
}

const report = {
  url: "http://localhost:1420/ (app) vs file:// dense wireframes 11/12",
  capture: "viewport",
  viewports: ["desktop"],
  masks: [],
  threshold,
  passed: null, // judged semantically; the diff is content-dominated by design
  results,
  createdAt: new Date().toISOString(),
};
await writeFile(
  "/tmp/opencode/qa/issue-11/eval/report.json",
  JSON.stringify(report, null, 2),
  "utf8",
);
console.log(JSON.stringify(results, null, 2));
