"use client";

import { useEffect, useState, type RefObject } from "react";
import { HourglassSand } from "@/components/scene/HourglassSand";
import { WanderingSpotlight } from "@/components/scene/WanderingSpotlight";
import { CursorTrail } from "@/components/scene/CursorTrail";
import { HomeCursor } from "@/components/scene/HomeCursor";

// Atmospheric flair bundle for the homepage. Mounts AFTER the first
// paint via requestIdleCallback (falls back to setTimeout) so the
// spotlight / hourglass-sand / cursor-trail / home-cursor JS doesn't
// compete with the hero LCP. These layers are all `pointer-events-none`
// + `aria-hidden` so a slightly delayed appearance is invisible to the
// user — they just see the static hero, then a beat later the gold
// drift starts.
export function HomeFlair({
  panelRef,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    type IdleHandle = number;
    type IdleCallback = (handle: IdleHandle) => void;
    type WindowWithIdle = Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number },
      ) => IdleHandle;
      cancelIdleCallback?: IdleCallback;
    };
    const w = window as WindowWithIdle;
    if (typeof w.requestIdleCallback === "function") {
      const handle = w.requestIdleCallback(() => setMounted(true), {
        timeout: 1500,
      });
      return () => w.cancelIdleCallback?.(handle);
    }
    const id = window.setTimeout(() => setMounted(true), 600);
    return () => window.clearTimeout(id);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <WanderingSpotlight />
      <HourglassSand />
      <CursorTrail panelRef={panelRef} />
      <HomeCursor />
    </>
  );
}
