// Title → URL-safe slug for /idea/<uuid>/<slug> SEO URLs.
//
// Pipeline:
//   1. NFC-normalize so e.g. precomposed "é" matches decomposed "é"
//   2. NFD-normalize then strip combining marks (drops diacritics —
//      "Ergonômic" → "Ergonomic"; "Café" → "Cafe")
//   3. Lowercase
//   4. Replace any run of non-[a-z0-9] with a single "-"
//      (this also wipes emoji, punctuation, spaces, CJK/Arabic/etc.)
//   5. Trim leading/trailing "-"
//   6. Cap at 60 chars without breaking mid-word: if the cap falls
//      inside a word, back off to the last "-" before the cap. If
//      there's no "-", hard-cut at 60.
//
// Returns "" when the title yields no usable ASCII alphanumerics
// (emoji-only, non-Latin script, whitespace-only). Callers should
// fall back to the bare /idea/<uuid> URL in that case.
export function titleToSlug(title: string): string {
  if (!title) return "";

  const MAX = 60;

  // NFC then NFD. NFC ensures any ligatures or precomposed forms
  // collapse predictably; NFD splits accented letters into base +
  // combining mark so the combining-mark regex below can strip them.
  const decomposed = title.normalize("NFC").normalize("NFD");

  // \p{M} is the Unicode "Mark" category — combining diacritics.
  const stripped = decomposed.replace(/\p{M}+/gu, "");

  const lowered = stripped.toLowerCase();

  // Collapse every run of non-[a-z0-9] into a single hyphen. Emoji,
  // CJK, Arabic, punctuation, whitespace — all become "-". This is
  // why titles in non-Latin scripts produce empty slugs (which is
  // acceptable; they'll render as bare UUID URLs).
  const hyphenated = lowered.replace(/[^a-z0-9]+/g, "-");

  // Trim leading/trailing hyphens that the previous pass introduced.
  const trimmed = hyphenated.replace(/^-+|-+$/g, "");

  if (trimmed.length <= MAX) return trimmed;

  // Cap at 60 without splitting a word: back off to the last "-"
  // inside the limit, then trim trailing "-". Falls back to a hard
  // cut if there's no "-" to back off to.
  const head = trimmed.slice(0, MAX);
  const lastDash = head.lastIndexOf("-");
  const candidate = lastDash > 0 ? head.slice(0, lastDash) : head;
  return candidate.replace(/-+$/, "");
}
