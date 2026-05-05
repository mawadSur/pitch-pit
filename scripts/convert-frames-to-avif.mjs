// One-shot: convert public/scene/frames-{1,2,3}/*.jpg → *.avif using sharp.
// AVIF runs ~30-50% smaller than the source JPEGs at equivalent quality
// and is supported in Chrome 85+ / Firefox 93+ / Safari 16+ — i.e. all
// modern browsers we ship to. Run once after pulling fresh JPEGs:
//
//   node scripts/convert-frames-to-avif.mjs
//
// Idempotent — skips frames whose .avif already exists. The original .jpg
// files are left in place so a `git revert` undoes the change cleanly.
// Delete them manually after confirming the canvas renders cleanly in
// every panel.

import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const DIRS = [
  "public/scene/frames-1",
  "public/scene/frames-2",
  "public/scene/frames-3",
];

// Quality 60 hits the AVIF sweet spot for photographic content — visually
// indistinguishable from JPEG q:75 but ~40% smaller. Effort 6 is the
// upper end of reasonable encoder time (~30s/dir on M-series).
const AVIF_OPTS = { quality: 60, effort: 6 };

async function totalSize(dir) {
  const entries = await readdir(dir);
  let bytes = 0;
  for (const name of entries) {
    const s = await stat(join(dir, name));
    bytes += s.size;
  }
  return bytes;
}

async function convertDir(rel) {
  const dir = join(ROOT, rel);
  const entries = (await readdir(dir)).filter((f) => f.endsWith(".jpg"));
  if (entries.length === 0) {
    console.log(`[${rel}] no .jpg files, skipping`);
    return;
  }

  const beforeBytes = await totalSize(dir);
  let converted = 0;
  let skipped = 0;

  for (const name of entries) {
    const inPath = join(dir, name);
    const outPath = inPath.replace(/\.jpg$/, ".avif");
    if (existsSync(outPath)) {
      skipped++;
      continue;
    }
    await sharp(inPath).avif(AVIF_OPTS).toFile(outPath);
    converted++;
  }

  const afterBytes = await totalSize(dir);
  const jpgBytes = (await Promise.all(
    entries.map(async (n) => (await stat(join(dir, n))).size),
  )).reduce((a, b) => a + b, 0);
  const avifBytes = afterBytes - jpgBytes;

  console.log(
    `[${rel}] converted=${converted} skipped=${skipped} ` +
      `jpg=${(jpgBytes / 1024 / 1024).toFixed(2)}MB ` +
      `avif=${(avifBytes / 1024 / 1024).toFixed(2)}MB ` +
      `savings=${(((jpgBytes - avifBytes) / jpgBytes) * 100).toFixed(1)}%`,
  );
}

for (const dir of DIRS) {
  await convertDir(dir);
}

console.log("\nDone. Update HeroPanel.tsx + HomeScene.tsx to use .avif paths,");
console.log("then test the canvas in every panel before deleting the JPEGs.");
