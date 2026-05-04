// Synchronous pre-screen for /api/score submissions. Runs BEFORE the Anthropic
// call, so obvious garbage never burns reviewer tokens. Three layers:
//
//   1. Prompt-injection detection — patterns that try to hijack the reviewer
//      ("ignore previous instructions", "you are now…", "<|im_start|>", etc.)
//   2. Slur / profanity detection — small targeted list. Not exhaustive by
//      design — Claude moderation handles nuance; this only catches the
//      no-judgment-required cases.
//   3. Quality heuristics — repetition ratio, all-caps, char-run spam.
//
// All three return a structured verdict with a machine-readable category and
// a user-facing message. `flagged === false` is the happy path.

export type FilterVerdict = {
  flagged: boolean;
  category?: "injection" | "profanity" | "low-effort" | "spam";
  reason?: string;
};

const PASS: FilterVerdict = { flagged: false };

// Prompt-injection patterns. Conservative on purpose — we don't want to
// false-flag legitimate pitches that mention "system", "ignore", etc.
// The patterns target *grammatical* injection attempts, not bare keywords.
const INJECTION_PATTERNS: RegExp[] = [
  // "ignore all previous instructions", "ignore the prior rules", etc.
  // Qualifier group is `+` so chains like "all previous" / "any prior"
  // both match.
  /\bignore\s+(?:(?:all|the|any|previous|prior|above|earlier)\s+)+(?:instructions?|rules?|prompts?)/i,
  /\b(?:disregard|forget|override)\s+(?:(?:all|the|any|previous|prior|above|earlier|your)\s+)+\w+/i,
  /\byou\s+are\s+now\s+(?:a|an)\s+(?:different|new)/i,
  /\bact\s+as\s+(?:a|an)\s+(?:different|new)/i,
  /\b(?:return|output|print|respond\s+with)\s+(?:score|rating|verdict)\s*[:=]?\s*\d/i,
  /\bsystem\s*[:>]\s/i,
  /<\|(?:im_start|im_end|system|user|assistant)\|>/i,
  /\[INST\]|\[\/INST\]/i,
  /\bnew\s+instructions?\s*[:>]/i,
];

// Hand-curated slur list — small, mostly used to catch lazy spam. Real
// moderation lives in the LLM call. Lowercased; word-boundary matched.
// Deliberately keeping this list short rather than comprehensive.
const SLURS: string[] = [
  // racial / ethnic
  "n1gger",
  "n1ggers",
  "nigger",
  "niggers",
  "kike",
  "kikes",
  "spic",
  "spics",
  "chink",
  "chinks",
  "gook",
  "gooks",
  "wetback",
  "wetbacks",
  "raghead",
  "ragheads",
  // anti-LGBTQ
  "faggot",
  "faggots",
  "tranny",
  "trannies",
  "dyke",
  "dykes",
  // ableist
  "retard",
  "retards",
  "retarded",
];

const SLUR_PATTERN = new RegExp(
  `\\b(?:${SLURS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i",
);

export function checkContent(text: string): FilterVerdict {
  // Trim once, work off the trimmed copy.
  const t = text.trim();
  if (t.length === 0) {
    return { flagged: true, category: "low-effort", reason: "Pitch is empty." };
  }

  // ─── Layer 1 · prompt injection ──────────────────────────────
  for (const pat of INJECTION_PATTERNS) {
    if (pat.test(t)) {
      return {
        flagged: true,
        category: "injection",
        reason:
          "Submission contains language that looks like an attempt to manipulate the reviewer.",
      };
    }
  }

  // ─── Layer 2 · slurs ──────────────────────────────────────────
  if (SLUR_PATTERN.test(t)) {
    return {
      flagged: true,
      category: "profanity",
      reason: "Submission contains slurs or hate speech.",
    };
  }

  // ─── Layer 3 · quality heuristics ─────────────────────────────
  // a) Long char run = "aaaaaaaa..." style spam
  if (/(.)\1{14,}/.test(t)) {
    return {
      flagged: true,
      category: "spam",
      reason: "Submission contains long runs of repeated characters.",
    };
  }

  // b) All-caps ratio. If 70%+ of letters are uppercase AND there are 30+
  //    letters total, treat as shouting/spam. (Acronyms don't trip this.)
  const letters = t.match(/[A-Za-z]/g) ?? [];
  if (letters.length >= 30) {
    const upper = letters.filter((c) => c === c.toUpperCase()).length;
    if (upper / letters.length > 0.7) {
      return {
        flagged: true,
        category: "spam",
        reason:
          "Submission is mostly uppercase. Use normal casing so the reviewer can read it.",
      };
    }
  }

  // c) Word count + unique-word ratio. Substance check.
  //    Tokenize by whitespace, lowercase, strip punctuation.
  const words = t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length < 12) {
    return {
      flagged: true,
      category: "low-effort",
      reason:
        "Pitch is too short on ideas — give the reviewer at least 12 words of actual substance.",
    };
  }

  // Unique-word ratio. "the the the the …" up to 60 chars passes the schema
  // but should fail here. Tolerate stop-word repetition; require ≥ 35%
  // distinct after counting.
  const uniqueRatio = new Set(words).size / words.length;
  if (words.length >= 20 && uniqueRatio < 0.35) {
    return {
      flagged: true,
      category: "low-effort",
      reason:
        "Pitch is too repetitive. Tell the reviewer something specific about your idea.",
    };
  }

  return PASS;
}
