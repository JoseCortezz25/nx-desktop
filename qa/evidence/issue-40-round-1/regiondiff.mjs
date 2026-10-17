import { readFileSync } from "node:fs";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

// usage: node regiondiff.mjs <base.png> <cur.png> <regionsJson>
const [, , basePath, curPath, regionsJson] = process.argv;
const regions = JSON.parse(regionsJson);

function crop(png, region) {
  const { x, y, width, height } = region;
  const out = new PNG({ width, height });
  for (let ry = 0; ry < height; ry++) {
    for (let rx = 0; rx < width; rx++) {
      const si = ((y + ry) * png.width + (x + rx)) * 4;
      const di = (ry * width + rx) * 4;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = png.data[si + 3];
    }
  }
  return out;
}

const base = PNG.sync.read(readFileSync(basePath));
const cur = PNG.sync.read(readFileSync(curPath));
const out = {};
for (const [name, region] of Object.entries(regions)) {
  const b = crop(base, region);
  const c = crop(cur, region);
  const d = new PNG({ width: region.width, height: region.height });
  const n = pixelmatch(b.data, c.data, d.data, region.width, region.height, {
    threshold: 0.1,
    includeAA: true,
  });
  out[name] = {
    rect: region,
    diffPixels: n,
    totalPixels: region.width * region.height,
    ratio: Number((n / (region.width * region.height)).toFixed(6)),
  };
}
console.log(JSON.stringify(out, null, 2));
