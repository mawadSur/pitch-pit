// Mobile-resolution sibling of scripts/convert-frames-to-avif.mjs.
// Converts public/scene/frames-{1,2,3}-mobile/*.jpg → *.avif using sharp.
// The mobile sequences are 640w extractions of the same MP4 sources, used
// by <HeroPanel mobileFramesPath="…"> on viewports ≤768px to cut canvas
// frame bandwidth in half on mobile 3G.
//
// Two-step workflow:
//
//   # 1. Extract 640w JPEGs from the source MP4s (frame counts match
//   #    the desktop sequences — 91 / 90 / 90 at fps=18). The desktop
//   #    sequences were extracted at scale=1024:-2; mobile uses 640:-2.
//   ffmpeg -i public/scene/transition-1.mp4 -vf "fps=18,scale=640:-2" -q:v 4 public/scene/frames-1-mobile/%03d.jpg -y
//   ffmpeg -i public/scene/transition-2.mp4 -vf "fps=18,scale=640:-2" -q:v 4 public/scene/frames-2-mobile/%03d.jpg -y
//   ffmpeg -i public/scene/last.mp4         -vf "fps=18,scale=640:-2" -q:v 4 public/scene/frames-3-mobile/%03d.jpg -y
//
//   # 2. Convert to AVIF (this script). Idempotent — skips frames
//   #    whose .avif already exists.
//   node scripts/convert-frames-to-avif-mobile.mjs
//
//   # 3. Verify size + counts, then remove intermediate JPEGs.
//   rm public/scene/frames-1-mobile/*.jpg
//   rm public/scene/frames-2-mobile/*.jpg
//   rm public/scene/frames-3-mobile/*.jpg
//
// Encoder settings match the desktop pass (quality 60, effort 6) so the
// mobile/desktop crossfade boundary feels identical — the only difference
// is pixel density.

import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const DIRS = [
  "public/scene/frames-1-mobile",
  "public/scene/frames-2-mobile",
  "public/scene/frames-3-mobile",
];

// Mirrors scripts/convert-frames-to-avif.mjs. Keep these in sync — if we
// ever bump quality/effort for the desktop pass, do it here too so the
// two encoders produce visually consistent output.
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
  if (!existsSync(dir)) {
    console.log(`[${rel}] directory missing — run the ffmpeg extraction first (see script header)`);
    return;
  }
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

console.log("\nDone. Delete the source JPEGs after verifying the mobile canvas renders cleanly.");
