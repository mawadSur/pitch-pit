#!/usr/bin/env node
// Build-time guard for the three FRAMES_*_COUNT constants in
// app/(no-footer)/HomeScene.tsx. Each constant feeds <HeroPanel frameCount={...}>,
// which in turn drives the canvas-scrub frame index. If the constant
// drifts from the actual count in public/scene/frames-N/, the canvas
// either skips frames (constant too high → nearestReady() fallback)
// or freezes early (constant too low → never reaches the last frame),
// and both failures are silent at runtime.
//
// This script reads HomeScene.tsx, extracts the three constants, counts
// .avif files in each frames-N/ directory, and bails the build if any
// pair disagrees. Wired into `prebuild` so `npm run build` enforces it
// automatically. Node-vanilla, no external deps.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const homeScenePath = path.join(projectRoot, "app", "(no-footer)", "HomeScene.tsx");
const framesRoot = path.join(projectRoot, "public", "scene");

// Triples of (constant name, directory name) — order matches the three
// panels: capture, judge, winner.
const PANELS = [
  { constant: "FRAMES_1_COUNT", dir: "frames-1" },
  { constant: "FRAMES_2_COUNT", dir: "frames-2" },
  { constant: "FRAMES_3_COUNT", dir: "frames-3" },
];

async function countAvif(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter(
    (e) => e.isFile() && e.name.toLowerCase().endsWith(".avif"),
  ).length;
}

function extractConstant(source, name) {
  // Match: `const FRAMES_N_COUNT = 91;` — tolerant of whitespace.
  const re = new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)\\s*;`);
  const m = source.match(re);
  if (!m) {
    throw new Error(
      `check-frame-counts: could not find \`const ${name} = <number>;\` in app/(no-footer)/HomeScene.tsx`,
    );
  }
  return Number(m[1]);
}

async function main() {
  const source = await readFile(homeScenePath, "utf8");

  const mismatches = [];
  for (const { constant, dir } of PANELS) {
    const declared = extractConstant(source, constant);
    let actual;
    try {
      actual = await countAvif(path.join(framesRoot, dir));
    } catch (err) {
      throw new Error(
        `check-frame-counts: cannot read public/scene/${dir}/ — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    if (declared !== actual) {
      mismatches.push({ constant, dir, declared, actual });
    }
  }

  if (mismatches.length > 0) {
    const lines = mismatches.map(
      (m) =>
        `  • ${m.constant} = ${m.declared}, but public/scene/${m.dir}/ contains ${m.actual} .avif files`,
    );
    console.error(
      [
        "check-frame-counts: frame count mismatch — canvas scrub will skip or freeze.",
        ...lines,
        "",
        "Fix: update the constant in app/(no-footer)/HomeScene.tsx to match the actual file count,",
        "or regenerate the frames so the counts realign. See CLAUDE.md → Frame sequences.",
      ].join("\n"),
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
