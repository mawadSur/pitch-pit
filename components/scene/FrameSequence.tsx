"use client";

import { useEffect, useRef } from "react";
import { useMotionValueEvent, useScroll } from "framer-motion";

const PAD = (n: number) => String(n).padStart(3, "0");

/**
 * Scroll-scrubbed pre-extracted frame sequence rendered to a <canvas>.
 *
 * Why canvas instead of <img>.src swapping:
 *  - <img>.src updates trigger a decode-on-display cycle in the browser, which
 *    visibly flickers between frames during fast scroll.
 *  - We pre-decode every frame upfront via Image.decode(), then drawImage()
 *    them onto a single canvas. drawImage on a decoded HTMLImageElement is
 *    a synchronous GPU blit — no flicker, no flash.
 *  - We RAF-batch draws so a flurry of scroll events collapses to one paint
 *    per frame, keeping it pinned at 60fps.
 */
export function FrameSequence({
  framesPath,
  frameCount,
  className = "",
}: {
  framesPath: string;
  frameCount: number;
  className?: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<(HTMLImageElement | null)[]>([]);
  const currentIdxRef = useRef(0);
  const lastDrawnIdxRef = useRef(-1);
  const rafIdRef = useRef<number | null>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  // ── preload + decode every frame ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    framesRef.current = new Array(frameCount).fill(null);

    function commit(idx: number, img: HTMLImageElement) {
      if (cancelled) return;
      framesRef.current[idx] = img;
      // Draw the very first frame as soon as it's ready, regardless of scroll
      if (idx === 0 && lastDrawnIdxRef.current === -1) scheduleDraw();
      // Re-draw if the user is currently parked on this idx and we hadn't drawn yet
      if (idx === currentIdxRef.current) scheduleDraw();
    }

    for (let i = 0; i < frameCount; i++) {
      const img = new Image();
      img.decoding = "async";
      img.src = `${framesPath}/${PAD(i + 1)}.jpg`;
      const idx = i;

      const onReady = () => commit(idx, img);

      img
        .decode()
        .then(onReady)
        .catch(() => {
          // older browsers / edge cases — fall back to onload/complete
          if (img.complete && img.naturalWidth > 0) onReady();
          else {
            img.onload = onReady;
            img.onerror = () => {};
          }
        });
    }

    return () => {
      cancelled = true;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [framesPath, frameCount]);

  // ── canvas sizing + resize handling ───────────────────────
  useEffect(() => {
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
      lastDrawnIdxRef.current = -1; // force redraw at new size
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
  }, []);

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
    const img = framesRef.current[idx];
    if (!canvas || !ctx || !img) {
      // If the requested frame isn't ready yet, fall back to nearest decoded one
      const fallback = nearestReady(idx);
      if (fallback === null || !ctx || !canvas) return;
      drawTo(canvas, ctx, framesRef.current[fallback]!);
      return;
    }
    drawTo(canvas, ctx, img);
    lastDrawnIdxRef.current = idx;
  }

  function nearestReady(target: number): number | null {
    // search outward from target for any decoded frame
    const f = framesRef.current;
    for (let off = 0; off < f.length; off++) {
      const a = target - off;
      if (a >= 0 && f[a]) return a;
      const b = target + off;
      if (b < f.length && f[b]) return b;
    }
    return null;
  }

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const targetIdx = Math.max(
      0,
      Math.min(Math.round(latest * (frameCount - 1)), frameCount - 1),
    );
    if (targetIdx === currentIdxRef.current) return;
    currentIdxRef.current = targetIdx;
    scheduleDraw();
  });

  return (
    <section
      ref={sectionRef}
      aria-hidden
      className={`relative h-screen bg-black ${className}`}
    >
      <div
        ref={wrapRef}
        className="sticky top-0 h-screen overflow-hidden bg-black"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full"
        />
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
