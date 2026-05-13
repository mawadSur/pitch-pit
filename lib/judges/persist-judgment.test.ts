// Integration tests for persistJudgment (lib/judges/persist-judgment.ts).
//
// persistJudgment turns a draft + judge panel into a persisted ideas row.
// The flow has several non-obvious branches we want to lock in:
//   - early-return when the draft already resolved
//   - require >= 2 judges (otherwise throw)
//   - summary fields pulled by JUDGE priority (gstack → vee → robbins)
//   - avg score rounded; build_recommended only when avg >= 7
//   - claim_token hash carried through as a Postgres bytea literal
//   - schema-drift retry path on undefined_column (42703)
//   - atomic claim race: winner returns own id, loser deletes orphan
//     and returns winner's id
//
// We mock @/lib/supabase/admin at the module boundary; the from()
// stub dispatches on table name and exposes "last write" capture
// variables we assert against.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock shapes ────────────────────────────────────────────────────
type IdeasInsertOutcome = {
  data?: { id: string } | null;
  error?: { code?: string; message: string } | null;
};

type State = {
  // Sequenced ideas-insert outcomes — first call gets [0], second [1], etc.
  ideasInserts: IdeasInsertOutcome[];
  // Update outcome for draft_pitches (atomic claim).
  claimResult: { data: { id: string } | null; error: { message: string } | null };
  // Re-read of the winning draft when we lost the race.
  winnerRead: {
    data: { resolved_idea_id: string | null } | null;
    error: { message: string } | null;
  };
  // Outcome for the orphan-delete step (only consulted on loss).
  deleteResult: { error: { message: string } | null };
};

let state: State;
let lastInsertPayloads: Record<string, unknown>[];
let lastDeleteIds: string[];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "ideas") {
        return {
          insert: (payload: Record<string, unknown>) => {
            lastInsertPayloads.push(payload);
            const idx = lastInsertPayloads.length - 1;
            const outcome =
              state.ideasInserts[idx] ?? state.ideasInserts.at(-1) ?? {};
            return {
              select: () => ({
                single: async () => ({
                  data: outcome.data ?? null,
                  error: outcome.error ?? null,
                }),
              }),
            };
          },
          delete: () => {
            const captured: { id?: string } = {};
            const builder = {
              eq(col: string, val: string) {
                if (col === "id") captured.id = val;
                if (captured.id) lastDeleteIds.push(captured.id);
                return Promise.resolve({ error: state.deleteResult.error });
              },
            };
            return builder;
          },
        };
      }
      if (table === "draft_pitches") {
        return {
          // Atomic claim: update(...).eq(id).is(resolved_idea_id, null)
          //   .select().maybeSingle()
          update: () => ({
            eq: () => ({
              is: () => ({
                select: () => ({
                  maybeSingle: async () => state.claimResult,
                }),
              }),
            }),
          }),
          // Lost-race re-read: select(...).eq(id).maybeSingle()
          select: () => ({
            eq: () => ({
              maybeSingle: async () => state.winnerRead,
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

// Sentry stub — persist-judgment calls captureException/Message on
// several branches. We don't assert on them, just absorb them.
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// server-only is a Next.js build-time package that has no Node runtime.
// Stub to a no-op so the module loads under vitest.
vi.mock("server-only", () => ({}));

// Import AFTER mocks.
import { persistJudgment, type JudgePanel } from "./persist-judgment";

// ─── Test fixtures ──────────────────────────────────────────────────
const RESULT_GSTACK = {
  score: 8,
  verdict: "Strong wedge.",
  strengths: ["clear demand"],
  concerns: ["distribution thin"],
  reasoning: "tight founder/market fit",
  build_recommended: true,
  moderation_flag: false,
  moderation_reason: "",
};
const RESULT_VEE = {
  score: 6,
  verdict: "Where does it live?",
  strengths: ["loud enough"],
  concerns: ["no channel"],
  reasoning: "needs distribution focus",
  build_recommended: false,
  moderation_flag: false,
  moderation_reason: "",
};
const RESULT_ROBBINS = {
  score: 7,
  verdict: "Standards are high.",
  strengths: ["conviction"],
  concerns: ["could be sharper"],
  reasoning: "fit but needs proof",
  build_recommended: true,
  moderation_flag: false,
  moderation_reason: "",
};

function makeDraft(over: Partial<Parameters<typeof persistJudgment>[0]> = {}) {
  return {
    id: "draft-1",
    user_id: "user-1" as string | null,
    access_token: "tok",
    title: "T",
    pitch: "p",
    handle: "h",
    resolved_idea_id: null as string | null,
    image_urls: [],
    claim_token: null as string | null,
    ...over,
  };
}

beforeEach(() => {
  state = {
    ideasInserts: [{ data: { id: "idea-new" }, error: null }],
    claimResult: { data: { id: "draft-1" }, error: null },
    winnerRead: { data: null, error: null },
    deleteResult: { error: null },
  };
  lastInsertPayloads = [];
  lastDeleteIds = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────
describe("persistJudgment", () => {
  it("short-circuits when the draft already resolved (no insert, no claim)", async () => {
    const draft = makeDraft({ resolved_idea_id: "existing-idea" });
    const panel: JudgePanel = {
      gstack: RESULT_GSTACK,
      vee: RESULT_VEE,
    };
    const out = await persistJudgment(draft, panel);
    expect(out).toEqual({ ideaId: "existing-idea" });
    expect(lastInsertPayloads).toHaveLength(0);
  });

  it("throws when fewer than two judges are present in the panel", async () => {
    const draft = makeDraft();
    await expect(
      persistJudgment(draft, { gstack: RESULT_GSTACK }),
    ).rejects.toThrow(/two judges/);
    // Single-judge panels never reach the DB.
    expect(lastInsertPayloads).toHaveLength(0);
  });

  it("happy path: inserts, claims, returns new idea id; summary fields come from gstack and avg score is rounded", async () => {
    const draft = makeDraft();
    const panel: JudgePanel = {
      gstack: RESULT_GSTACK, // score 8
      vee: RESULT_VEE, // score 6
      robbins: RESULT_ROBBINS, // score 7
    };
    const out = await persistJudgment(draft, panel);
    expect(out).toEqual({ ideaId: "idea-new" });

    expect(lastInsertPayloads).toHaveLength(1);
    const insert = lastInsertPayloads[0];
    // (8 + 6 + 7) / 3 = 7.0 → round to 7.
    expect(insert.score).toBe(7);
    // build_recommended is derived from avg >= 7 — NOT from the summary judge.
    expect(insert.build_recommended).toBe(true);
    // Summary lifted from gstack (highest priority).
    expect(insert.verdict).toBe(RESULT_GSTACK.verdict);
    expect(insert.strengths).toBe(RESULT_GSTACK.strengths);
    expect(insert.concerns).toBe(RESULT_GSTACK.concerns);
    expect(insert.reasoning).toBe(RESULT_GSTACK.reasoning);
    // Original panel payload mirrored into judge_scores.
    expect(insert.judge_scores).toBe(panel);
    expect(insert.status).toBe("scored");
  });

  it("falls back to vee as summary judge when gstack errored (priority chain)", async () => {
    const draft = makeDraft();
    const panel: JudgePanel = {
      vee: RESULT_VEE,
      robbins: RESULT_ROBBINS,
    };
    await persistJudgment(draft, panel);
    const insert = lastInsertPayloads[0];
    expect(insert.verdict).toBe(RESULT_VEE.verdict);
    // (6 + 7) / 2 = 6.5 → rounds to 7 (JS Math.round uses banker's away-from-zero
    // for x.5 positives → 7). build_recommended is true since avg = 7.
    expect(insert.score).toBe(7);
    expect(insert.build_recommended).toBe(true);
  });

  it("build_recommended is false when avg < 7", async () => {
    const draft = makeDraft();
    const panel: JudgePanel = {
      gstack: { ...RESULT_GSTACK, score: 4 },
      vee: { ...RESULT_VEE, score: 5 }, // avg = 4.5 → 5
    };
    await persistJudgment(draft, panel);
    expect(lastInsertPayloads[0].score).toBe(5);
    expect(lastInsertPayloads[0].build_recommended).toBe(false);
  });

  it("carries image_urls + claim_token into the insert (and hashes claim_token to bytea)", async () => {
    const draft = makeDraft({
      image_urls: ["https://x/a.jpg", "https://x/b.jpg"],
      claim_token: "deadbeef".repeat(4), // 32-char hex
    });
    const panel: JudgePanel = {
      gstack: RESULT_GSTACK,
      vee: RESULT_VEE,
    };
    await persistJudgment(draft, panel);

    const insert = lastInsertPayloads[0];
    expect(insert.image_urls).toEqual(draft.image_urls);
    expect(insert.claim_token).toBe(draft.claim_token);
    // bytea literal prefix \x + 64 hex chars (sha256 = 32 bytes).
    expect(typeof insert.claim_token_sha256).toBe("string");
    expect(insert.claim_token_sha256).toMatch(/^\\x[0-9a-f]{64}$/);
  });

  it("skips image_urls/claim_token in the insert when the draft has none", async () => {
    const draft = makeDraft({
      image_urls: [],
      claim_token: null,
    });
    const panel: JudgePanel = { gstack: RESULT_GSTACK, vee: RESULT_VEE };
    await persistJudgment(draft, panel);
    const insert = lastInsertPayloads[0];
    expect("image_urls" in insert).toBe(false);
    expect("claim_token" in insert).toBe(false);
    expect("claim_token_sha256" in insert).toBe(false);
  });

  it("retries without claim_token columns on undefined_column error (42703)", async () => {
    state.ideasInserts = [
      // First insert fails with 42703 because ideas table lacks claim_token.
      { data: null, error: { code: "42703", message: "column missing" } },
      // Retry without the columns succeeds.
      { data: { id: "idea-retry" }, error: null },
    ];
    const draft = makeDraft({
      claim_token: "deadbeef".repeat(4),
    });
    const panel: JudgePanel = { gstack: RESULT_GSTACK, vee: RESULT_VEE };
    const out = await persistJudgment(draft, panel);
    expect(out).toEqual({ ideaId: "idea-retry" });
    expect(lastInsertPayloads).toHaveLength(2);
    // Retry insert has neither column.
    const retry = lastInsertPayloads[1];
    expect("claim_token" in retry).toBe(false);
    expect("claim_token_sha256" in retry).toBe(false);
  });

  it("throws when both initial insert and retry fail", async () => {
    state.ideasInserts = [
      { data: null, error: { code: "23505", message: "dup" } },
    ];
    const draft = makeDraft();
    const panel: JudgePanel = { gstack: RESULT_GSTACK, vee: RESULT_VEE };
    await expect(persistJudgment(draft, panel)).rejects.toThrow(
      /persist/i,
    );
  });

  it("lost claim race: deletes orphan idea, returns the winner's resolved_idea_id", async () => {
    // Insert succeeds, but the atomic update matches 0 rows (someone else
    // already populated resolved_idea_id between read and update).
    state.claimResult = { data: null, error: null };
    state.winnerRead = {
      data: { resolved_idea_id: "winner-idea" },
      error: null,
    };
    const draft = makeDraft();
    const panel: JudgePanel = { gstack: RESULT_GSTACK, vee: RESULT_VEE };
    const out = await persistJudgment(draft, panel);
    expect(out).toEqual({ ideaId: "winner-idea" });
    // Our orphan id was deleted.
    expect(lastDeleteIds).toEqual(["idea-new"]);
  });

  it("lost race + reread fails → throws (so the page can fall back)", async () => {
    state.claimResult = { data: null, error: null };
    state.winnerRead = {
      data: null,
      error: { message: "select failed" },
    };
    const draft = makeDraft();
    const panel: JudgePanel = { gstack: RESULT_GSTACK, vee: RESULT_VEE };
    await expect(persistJudgment(draft, panel)).rejects.toThrow(
      /persist/i,
    );
  });

  it("DB error during the claim throws (don't try to recover)", async () => {
    state.claimResult = {
      data: null,
      error: { message: "FK violation" },
    };
    const draft = makeDraft();
    const panel: JudgePanel = { gstack: RESULT_GSTACK, vee: RESULT_VEE };
    await expect(persistJudgment(draft, panel)).rejects.toThrow(
      /persist/i,
    );
  });
});
