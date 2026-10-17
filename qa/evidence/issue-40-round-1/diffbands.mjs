import { readFileSync } from "node:fs";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const [, , basePath, curPath, ...rest] = process.argv;
const bands = Number(rest[0] ?? 8);

const base = PNG.sync.read(readFileSync(basePath));
const cur = PNG.sync.read(readFileSync(curPath));
if (base.width !== cur.width || base.height !== cur.height) {
  console.log(
    JSON.stringify({
      error: "dimension-mismatch",
      base: [base.width, base.height],
      cur: [cur.width, cur.height],
    }),
  );
  process.exit(0);
}
const { width, height } = base;
const diff = new PNG({ width, height });
const total = pixelmatch(base.data, cur.data, diff.data, width, height, {
  threshold: 0.1,
  includeAA: true,
});

// per-column-band distribution
const bandW = Math.ceil(width / bands);
const perBand = [];
for (let b = 0; b < bands; b++) {
  const x0 = b * bandW;
  const x1 = Math.min(width, x0 + bandW);
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      // pixelmatch writes the diff pixel (red) into diff.data
      if (
        diff.data[i] === 255 &&
        diff.data[i + 1] === 0 &&
        diff.data[i + 2] === 0
      )
        n++;
    }
  }
  perBand.push({ x0, x1, diffPixels: n });
}
console.log(
  JSON.stringify(
    { width, height, total, ratio: total / (width * height), perBand },
    null,
    2,
  ),
);
