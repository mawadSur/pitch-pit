"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Click-to-zoom strip for the attachments the founder uploaded with their
// pitch. Renders 1–3 thumbnails in a row; clicking any one opens a
// lightbox with arrow-key + ←/→ navigation, Esc to close.
//
// Self-contained: doesn't depend on any modal library. The lightbox is
// a position:fixed overlay with framer-motion fade. We bound max width
// to the existing 3xl reading column so the strip lines up with the
// pitch blockquote above it.
export function AttachmentGallery({ urls }: { urls: string[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const total = urls.length;

  const close = useCallback(() => setActiveIndex(null), []);
  const next = useCallback(
    () => setActiveIndex((i) => (i === null ? null : (i + 1) % total)),
    [total],
  );
  const prev = useCallback(
    () =>
      setActiveIndex((i) =>
        i === null ? null : (i - 1 + total) % total,
      ),
    [total],
  );

  // Keyboard navigation in the lightbox.
  useEffect(() => {
    if (activeIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, close, next, prev]);

  if (urls.length === 0) return null;

  return (
    <>
      <div
        className={
          urls.length === 1
            ? "grid grid-cols-1 gap-3"
            : urls.length === 2
              ? "grid grid-cols-2 gap-3"
              : "grid grid-cols-2 gap-3 sm:grid-cols-3"
        }
      >
        {urls.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setActiveIndex(i)}
            aria-label={`Open attachment ${i + 1} of ${urls.length}`}
            className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] transition-all hover:border-[var(--scene-gold)]/55 hover:shadow-[0_0_36px_-8px_rgba(255,184,0,0.35)] focus-visible:border-[var(--scene-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/55 focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--scene-bg)]"
          >
            <Image
              src={url}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, 240px"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              unoptimized
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100"
            />
          </button>
        ))}
      </div>

      <AnimatePresence>
        {activeIndex !== null && (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/85 backdrop-blur-md"
            onClick={close}
            role="dialog"
            aria-modal="true"
            aria-label="Attachment viewer"
          >
            {/* close affordance — top-right */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
              aria-label="Close viewer"
              className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/85 transition-colors hover:border-[var(--scene-gold)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="4" y1="4" x2="14" y2="14" />
                <line x1="14" y1="4" x2="4" y2="14" />
              </svg>
            </button>

            {/* prev / next arrows — only shown when >1 attachment */}
            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    prev();
                  }}
                  aria-label="Previous attachment"
                  className="absolute left-5 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/85 transition-colors hover:border-[var(--scene-gold)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="12 4 6 10 12 16" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    next();
                  }}
                  aria-label="Next attachment"
                  className="absolute right-5 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/85 transition-colors hover:border-[var(--scene-gold)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="8 4 14 10 8 16" />
                  </svg>
                </button>
              </>
            )}

            {/* the image — bounded so it never overflows the viewport */}
            <motion.img
              key={urls[activeIndex]}
              src={urls[activeIndex]}
              alt=""
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[92vh] max-w-[92vw] rounded-lg border border-white/10 object-contain shadow-[0_40px_120px_-20px_rgba(0,0,0,0.85)]"
            />

            {/* counter — bottom-center when >1 */}
            {total > 1 && (
              <span
                aria-hidden
                className="scene-mono absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-white/12 bg-black/55 px-3 py-1 text-[0.65rem] uppercase tracking-[0.32em] text-white/65"
              >
                {activeIndex + 1} / {total}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
