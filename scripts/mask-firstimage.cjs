// One-shot: dark-fade the bottom ~55% of public/scene/firstimage.avif so
// the painted gold input pill (baked into the cinematic asset) is hidden.
// The new homepage two-piece input now sits cleanly on dark space instead
// of bleeding out past the painted pill underneath.
//
// Run from the project root:  node scripts/mask-firstimage.cjs

const sharp = require("sharp");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "public", "scene", "firstimage.avif");
const OUT = path.join(__dirname, "..", "public", "scene", "firstimage.avif");

(async () => {
  const meta = await sharp(SRC).metadata();
  const W = meta.width;
  const H = meta.height;
  console.log(`source: ${W}x${H}`);

  const gradientSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="black" stop-opacity="0"/>
        <stop offset="35%" stop-color="black" stop-opacity="0"/>
        <stop offset="48%" stop-color="black" stop-opacity="1"/>
        <stop offset="100%" stop-color="black" stop-opacity="1"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#fade)"/>
  </svg>`;

  const overlay = await sharp(Buffer.from(gradientSvg))
    .resize(W, H)
    .png()
    .toBuffer();

  // Write to a temp first so we don't half-clobber the source on a crash.
  const tmp = path.join("/tmp", "firstimage-masked.avif");
  await sharp(SRC)
    .composite([{ input: overlay, blend: "over" }])
    .avif({ quality: 65, effort: 6 })
    .toFile(tmp);

  // Preview alongside for visual verification.
  await sharp(tmp).resize(800).toFormat("png").toFile("/tmp/preview-masked.png");

  // Atomic-ish replace.
  require("node:fs").copyFileSync(tmp, OUT);
  console.log("replaced:", OUT);
  console.log("preview:  /tmp/preview-masked.png");
})();
