"use client";

import NextImage from "next/image";
import { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useScroll } from "framer-motion";

const PAD = (n: number) => String(n).padStart(3, "0");

type Tone = "dark" | "light";

/**
 * A panel section that combines:
 *   • a static "at-rest" background image (visible at the very start of the
 *     section's scroll range — i.e., the moment the user enters this panel)
 *   • a frame-sequence canvas that scrubs forward as the user scrolls within
 *     the same section
 *
 * As soon as the user scrolls a hair from the section's entry point, the
 * static image crossfades out and the canvas takes over, scrubbing through
 * `framesPath/{001..N}.avif` from frame 0 to frame N-1 across the panel's
 * full pin duration.
 *
 * Implementation notes:
 *   - Image and canvas are stacked absolutely. The "swap" is pure CSS opacity
 *     — no DOM mutation, no flicker, no layout shift.
 *   - Frames are decoded up front (Image.decode()) so each scroll-driven
 *     redraw is a synchronous GPU blit on the canvas. No decode-on-display.
 *   - draws are RAF-batched: scroll bursts collapse to one paint per frame.
 *   - If `framesPath`/`frameCount` are omitted, the panel is image-only — no
 *     canvas, no scrub, no swap.
 */
interface HeroPanelProps {
  image: string;
  /** Path to the frame sequence (eg "/scene/frames-1"). Omit for image-only. */
  framesPath?: string;
  /** Total frame count in the sequence (matches the JPEG file count). */
  frameCount?: number;
  alt?: string;
  tone?: Tone;
  priority?: boolean;
  children: React.ReactNode;
  id?: string;
  /**
   * Section height in vh. Default 100 = single viewport (no extra scroll).
   * Larger gives the canvas more scroll room: pin duration = heightVh - 100.
   * The frame scrub is mapped to the pin range, so the animation completes
   * while the panel is still locked in front of the user (not after they've
   * scrolled past it).
   */
  heightVh?: number;
}

// Image is visible only across the very first slice of the section's scroll
// range. Tight enough that "any scroll" swaps to the frames; generous enough
// to feel like a smooth crossfade rather than a snap.
const SWAP_THRESHOLD = 0.005;

export function HeroPanel({
  image,
  framesPath,
  frameCount,
  alt = "",
  tone = "dark",
  priority = false,
  children,
  id,
  heightVh = 100,
}: HeroPanelProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<(HTMLImageElement | null)[]>([]);
  const currentIdxRef = useRef(0);
  const lastDrawnIdxRef = useRef(-1);
  const rafIdRef = useRef<number | null>(null);

  const [scrolled, setScrolled] = useState(false);
  // Default false: on mobile, the canvas DOM should never appear at any
  // point. Desktop has a 1-frame "wrong" state before the matchMedia check
  // upgrades this to true — invisible since the canvas needs frame loads
  // before it draws anything anyway.
  const [largeEnough, setLargeEnough] = useState(false);

  const hasFrames = !!framesPath && !!frameCount && frameCount > 0;
  // Mobile: skip the canvas entirely to save memory + cpu. The static image
  // stays visible across the whole panel; no scrubbing on small screens.
  const canvasActive = hasFrames && largeEnough;

  // Detect viewport ≥ 768px for canvas activation
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setLargeEnough(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Fraction of section scroll that the panel is pinned for.
  //   heightVh = 100 → pinFraction = 0   (no extra scroll, scrub spans full range)
  //   heightVh = 200 → pinFraction = 0.5 (pin lasts first 50% of scroll)
  //   heightVh = 300 → pinFraction = 0.67
  const pinFraction = Math.max(0, (heightVh - 100) / heightVh);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  // ── preload + decode every frame, in two batches ──────────
  // Batch 1 (frames 1..30): fire immediately so the scrub starts instantly.
  // Batch 2 (frames 31..end): defer until the user starts scrolling, or 4s
  // elapse (whichever comes first). Cuts initial-byte download in half on
  // landing — frames 31+ aren't visible until the user has scrolled into
  // the upper half of the section anyway.
  useEffect(() => {
    if (!canvasActive || !framesPath || !frameCount) return;
    let cancelled = false;
    framesRef.current = new Array(frameCount).fill(null);

    const commit = (idx: number, img: HTMLImageElement) => {
      if (cancelled) return;
      framesRef.current[idx] = img;
      if (idx === 0 && lastDrawnIdxRef.current === -1) scheduleDraw();
      if (idx === currentIdxRef.current) scheduleDraw();
    };

    const loadOne = (i: number) => {
      const img = new Image();
      img.decoding = "async";
      img.src = `${framesPath}/${PAD(i + 1)}.avif`;
      const idx = i;
      const ready = () => commit(idx, img);
      img
        .decode()
        .then(ready)
        .catch(() => {
          if (img.complete && img.naturalWidth > 0) ready();
          else img.onload = ready;
        });
    };

    // Batch 1 — first 30 frames immediately
    const FIRST_BATCH = Math.min(30, frameCount);
    for (let i = 0; i < FIRST_BATCH; i++) loadOne(i);

    // Batch 2 — defer until scroll-start or 4s safety net
    let secondBatchLoaded = false;
    const loadRest = () => {
      if (secondBatchLoaded || cancelled) return;
      secondBatchLoaded = true;
      for (let i = FIRST_BATCH; i < frameCount; i++) loadOne(i);
    };

    const onFirstScroll = () => loadRest();
    window.addEventListener("scroll", onFirstScroll, {
      once: true,
      passive: true,
    });
    const timeoutId = window.setTimeout(loadRest, 4000);

    return () => {
      cancelled = true;
      window.removeEventListener("scroll", onFirstScroll);
      window.clearTimeout(timeoutId);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [canvasActive, framesPath, frameCount]);

  // ── canvas sizing + resize handling ───────────────────────
  useEffect(() => {
    if (!canvasActive) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    function resize() {
      if (!canvas || !wrap) return;
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      lastDrawnIdxRef.current = -1;
      scheduleDraw();
    }

    resize();
    window.addEventListener("resize", resize);
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => {
      window.removeEventListener("resize", resize);
      ro.disconnect();
    };
  }, [canvasActive]);

  function scheduleDraw() {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      drawFrame(currentIdxRef.current);
      rafIdRef.current = null;
    });
  }

  function drawFrame(idx: number) {
    if (idx === lastDrawnIdxRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let img = framesRef.current[idx];
    if (!img) img = nearestReady(idx);
    if (!img) return;
    drawTo(canvas, ctx, img);
    lastDrawnIdxRef.current = idx;
  }

  function nearestReady(target: number): HTMLImageElement | null {
    const f = framesRef.current;
    for (let off = 1; off < f.length; off++) {
      const a = target - off;
      if (a >= 0 && f[a]) return f[a];
      const b = target + off;
      if (b < f.length && f[b]) return f[b];
    }
    return null;
  }

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    // Map raw scroll progress (0..1 over the whole section) to pin progress
    // (0..1 across the panel-pinned portion only). Beyond the pin, the
    // frames stay parked at the last frame while the panel scrolls away.
    const pinProgress =
      pinFraction > 0 ? Math.min(1, latest / pinFraction) : latest;

    // Only crossfade the static image when the canvas is going to take
    // over. On mobile (canvas disabled), keep the image visible the whole
    // way — otherwise we'd fade to a black background with nothing behind.
    if (canvasActive) {
      const next = pinProgress > SWAP_THRESHOLD;
      setScrolled((prev) => (prev === next ? prev : next));
    }

    // scrub frames if canvas is active (skipped on mobile)
    if (!canvasActive || !frameCount) return;
    const targetIdx = Math.max(
      0,
      Math.min(Math.round(pinProgress * (frameCount - 1)), frameCount - 1),
    );
    if (targetIdx === currentIdxRef.current) return;
    currentIdxRef.current = targetIdx;
    scheduleDraw();
  });

  return (
    <section
      ref={sectionRef}
      id={id}
      className="relative"
      style={{ height: `${heightVh}vh` }}
    >
      <div
        ref={wrapRef}
        className="sticky top-0 h-screen overflow-hidden bg-black"
      >
        {/* Static "at-rest" image — visible at section entry only */}
        <div
          aria-hidden={scrolled}
          className="absolute inset-0 transition-opacity duration-300 ease-out"
          style={{ opacity: scrolled ? 0 : 1 }}
        >
          <NextImage
            src={image}
            alt={alt}
            fill
            priority={priority}
            quality={88}
            sizes="100vw"
            className="object-cover"
          />
        </div>

        {/* Frame canvas — visible & scrubbing whenever scrolled (desktop+ only) */}
        {canvasActive && (
          <canvas
            ref={canvasRef}
            aria-hidden
            className="absolute inset-0 block h-full w-full transition-opacity duration-300 ease-out"
            style={{ opacity: scrolled ? 1 : 0 }}
          />
        )}

        {/* darkening vignette for content readability */}
        <div
          aria-hidden
          className={
            tone === "light"
              ? "panel-vignette panel-vignette-light"
              : "panel-vignette"
          }
        />

        {/* hero content overlay */}
        <div className="relative z-10 flex h-full items-center justify-center px-6 sm:px-10">
          {children}
        </div>
      </div>
    </section>
  );
}

// ── object-cover semantics for canvas drawImage ────────────
function drawTo(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
) {
  const cw = canvas.width;
  const ch = canvas.height;
  if (cw === 0 || ch === 0 || img.naturalWidth === 0 || img.naturalHeight === 0) {
    return;
  }
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const canvasAspect = cw / ch;
  let dw: number, dh: number, dx: number, dy: number;
  if (imgAspect > canvasAspect) {
    // image wider — scale by canvas height, crop horizontally
    dh = ch;
    dw = ch * imgAspect;
    dx = (cw - dw) / 2;
    dy = 0;
  } else {
    // image taller — scale by canvas width, crop vertically
    dw = cw;
    dh = cw / imgAspect;
    dx = 0;
    dy = (ch - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}
