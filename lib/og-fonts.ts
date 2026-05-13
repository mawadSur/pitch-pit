// OG-card font loader. next/og's ImageResponse supports TTF, OTF, and
// WOFF (not WOFF2), so we can't reuse the WOFF2 files we ship under
// /public/fonts for the runtime UI. Google Fonts serves a TTF for the
// css2 endpoint when the User-Agent header indicates an older browser
// — that's the documented way to grab a TTF binary for next/og.
//
// We fetch once per cold start and cache the ArrayBuffer in module state.
// Failures degrade silently: the caller falls back to system fonts so a
// flaky Google Fonts response can't break share previews.

let frauncesPromise: Promise<ArrayBuffer | null> | null = null;
let frauncesItalicPromise: Promise<ArrayBuffer | null> | null = null;

async function fetchTtfFromGoogleFonts(
  family: string,
  weight: number,
  italic: boolean,
): Promise<ArrayBuffer | null> {
  try {
    // ital,wght axis if italic; otherwise wght-only. The css2 endpoint
    // serves TTF when the UA is "old enough" to predate WOFF2 support.
    const axisParam = italic ? `ital,wght@1,${weight}` : `wght@${weight}`;
    const cssUrl = `https://fonts.googleapis.com/css2?family=${family}:${axisParam}&display=swap`;
    const cssRes = await fetch(cssUrl, {
      headers: {
        // IE-era UA forces the Google Fonts API to serve TTF in @font-face.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko",
      },
      // Re-use across requests for the lifetime of the runtime.
      cache: "force-cache",
    });
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    // Match the first src: url(...) format('truetype') entry. Older UAs
    // typically get one entry per face; we take the first.
    const match = css.match(/src:\s*url\((https:\/\/[^)]+)\)\s*format\(['"]?truetype['"]?\)/);
    if (!match) return null;
    const fontRes = await fetch(match[1], { cache: "force-cache" });
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

// Fraunces 600 (semi-bold) — the display weight used on the site's
// h1 + verdict + score numerals. Returns the TTF binary or null on
// failure. The first caller in a cold start triggers the network fetch;
// subsequent callers within the same runtime get the cached promise.
export function loadFraunces(): Promise<ArrayBuffer | null> {
  if (!frauncesPromise) {
    frauncesPromise = fetchTtfFromGoogleFonts("Fraunces", 600, false);
  }
  return frauncesPromise;
}

// Fraunces italic 600 — for the verdict pull-quote OG variant. Same
// cache + fail-soft model as loadFraunces above.
export function loadFrauncesItalic(): Promise<ArrayBuffer | null> {
  if (!frauncesItalicPromise) {
    frauncesItalicPromise = fetchTtfFromGoogleFonts("Fraunces", 600, true);
  }
  return frauncesItalicPromise;
}
