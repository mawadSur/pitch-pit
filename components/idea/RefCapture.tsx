"use client";

import { useEffect } from "react";

// Matches a canonical v4-ish UUID (the shape Supabase/gen_random_uuid emits).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RefCapture — invisible client component (Tactic 1, ref attribution).
 *
 * Every shared idea link carries `?ref=<idea_id>`. When a visitor lands on
 * an idea page via such a link, we stash the referring idea id in the
 * `pp_ref` cookie (30-day, lax) so that if they later sign in and vote, the
 * vote API can attribute it to the referrer. We then strip `?ref` from the
 * visible URL via history.replaceState so the address bar stays clean and
 * the ref doesn't leak into copy-pasted / canonical links.
 *
 * Best-effort and SSR-safe: renders null, guards `window`, swallows the
 * (theoretical) replaceState failure rather than throwing on the page.
 */
export function RefCapture() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (!ref || !UUID_RE.test(ref)) return;

    // 30 days (2592000s), path=/ so it survives the canonical redirect, lax
    // so it rides along on the post-login top-level navigation back here.
    document.cookie = `pp_ref=${ref}; path=/; max-age=2592000; samesite=lax`;

    // Strip ?ref (and only ?ref) from the visible URL for cleanliness.
    try {
      params.delete("ref");
      const query = params.toString();
      const cleaned =
        window.location.pathname +
        (query ? `?${query}` : "") +
        window.location.hash;
      window.history.replaceState(window.history.state, "", cleaned);
    } catch {
      // replaceState can throw in exotic sandboxes — the cookie is already
      // set, which is the load-bearing part. Leaving ?ref in the bar is fine.
    }
  }, []);

  return null;
}
