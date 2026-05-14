// Integration tests for POST /api/build-callback.
//
// The callback receives progress + terminal updates from the GitHub Actions
// builder. Auth is per-build via `callback_token` minted in
// close-week-and-build. State machine:
//   build_phase: queued → generating → deploying → complete | failed
// First `failed` → bump retry_count, mint fresh token, re-dispatch.
// Second `failed` → terminal: mark queue failed, null token, send
//                   fallback email.
//
// Coverage (matches the spec in build-callback-test-gap.md):
//   1. Token validation: wrong/missing token → 404 unknown-build;
//      missing/invalid body → 400 invalid-body / invalid-json.
//   2. Terminal idempotency: status complete|failed → 409, no writes.
//   3. Retry path: first failure → retry_count=1 + fresh token + dispatch;
//      second failure → terminal + fallback email.
//   4. Phase transitions: generating/deploying only update build_phase;
//      complete requires mvp_url and flips idea → built.
//   5. build_logs append: preserves prior entries, caps at 200 entries
//      without dropping the new one.
//
// Mocks at the same module boundary as
// app/api/cron/close-week-and-build/route.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";

type QueueRow = {
  id: string;
  idea_id: string;
  status: "in_progress" | "complete" | "failed";
  retry_count: number;
  callback_token: string | null;
  build_phase: string;
  build_logs?: Array<{ ts: string; phase: string; msg: string }>;
};

type IdeaRow = {
  id: string;
  title: string;
  pitch: string;
  score: number;
  final_score: number;
  verdict: string;
  strengths: string[] | null;
  concerns: string[] | null;
  reasoning: string | null;
};

type State = {
  queue?: QueueRow | null;
  queueLookupError?: { message: string } | null;
  idea?: IdeaRow | null;
  // override the build_logs returned by the second select on build_queue
  buildLogs?: unknown;
};

let state: State = {};
let lastQueueUpdate: Record<string, unknown> | null = null;
let queueUpdates: Array<Record<string, unknown>> = [];
let lastIdeaUpdate: Record<string, unknown> | null = null;

const sendBuildNotificationMock =
  vi.fn<(idea: IdeaRow) => Promise<void>>();
const dispatchBuildMock = vi.fn<(opts: unknown) => Promise<void>>();
const isDispatchConfiguredMock = vi.fn<() => boolean>();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "build_queue") {
        return {
          // Two select shapes:
          //   1) lookup by callback_token → .select(...).eq(...).maybeSingle()
          //   2) refetch build_logs → .select("build_logs").eq("id", ...).maybeSingle()
          select: (cols: string) => ({
            eq: (col: string) => ({
              maybeSingle: async () => {
                if (col === "callback_token") {
                  return {
                    data: state.queue ?? null,
                    error: state.queueLookupError ?? null,
                  };
                }
                // Refetch for log append. Return either an explicit override
                // or whatever build_logs the queue row carries.
                const fallback = state.queue?.build_logs ?? [];
                const data =
                  state.buildLogs !== undefined
                    ? { build_logs: state.buildLogs }
                    : { build_logs: fallback };
                return { data, error: null };
              },
            }),
            _cols: cols,
          }),
          update: (patch: Record<string, unknown>) => {
            lastQueueUpdate = patch;
            queueUpdates.push(patch);
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }
      if (table === "ideas") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: state.idea ?? null,
                error: null,
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            lastIdeaUpdate = patch;
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }
      return {};
    },
  }),
}));

vi.mock("@/lib/email", () => ({
  sendBuildNotification: (idea: IdeaRow) => sendBuildNotificationMock(idea),
}));

vi.mock("@/lib/build-dispatch", () => ({
  dispatchBuild: (opts: unknown) => dispatchBuildMock(opts),
  isDispatchConfigured: () => isDispatchConfiguredMock(),
  // Deterministic token so retry-path assertions are exact.
  mintCallbackToken: () => "fresh-retry-token-fixed",
}));

// Import AFTER mocks.
import { POST } from "./route";

function makeReq(body: unknown | "INVALID_JSON"): Request {
  return {
    json: async () => {
      if (body === "INVALID_JSON") {
        throw new SyntaxError("Unexpected token");
      }
      return body;
    },
  } as unknown as Request;
}

const QUEUE_ID = "queue-row-1";
const IDEA_ID = "idea-1";
const TOKEN = "valid-callback-token-abc";

const BASE_QUEUE: QueueRow = {
  id: QUEUE_ID,
  idea_id: IDEA_ID,
  status: "in_progress",
  retry_count: 0,
  callback_token: TOKEN,
  build_phase: "queued",
  build_logs: [],
};

const BASE_IDEA: IdeaRow = {
  id: IDEA_ID,
  title: "Test Pitch",
  pitch: "A pitch.",
  score: 8,
  final_score: 80,
  verdict: "built",
  strengths: ["wedge"],
  concerns: ["distribution"],
  reasoning: "tight",
};

describe("POST /api/build-callback", () => {
  beforeEach(() => {
    state = {};
    lastQueueUpdate = null;
    queueUpdates = [];
    lastIdeaUpdate = null;
    sendBuildNotificationMock.mockReset();
    sendBuildNotificationMock.mockResolvedValue(undefined);
    dispatchBuildMock.mockReset();
    dispatchBuildMock.mockResolvedValue(undefined);
    isDispatchConfiguredMock.mockReset();
    isDispatchConfiguredMock.mockReturnValue(true);
  });

  // ─── 1. Token + body validation ────────────────────────────────────

  it("returns 400 invalid-json when the body cannot be parsed", async () => {
    const res = await POST(makeReq("INVALID_JSON") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid-json");
    expect(lastQueueUpdate).toBeNull();
  });

  it("returns 400 invalid-body when callback_token is missing", async () => {
    const res = await POST(
      makeReq({ idea_id: IDEA_ID, phase: "generating" }) as never,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid-body");
  });

  it("returns 400 invalid-body when idea_id is missing", async () => {
    const res = await POST(
      makeReq({ callback_token: TOKEN, phase: "generating" }) as never,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid-body");
  });

  it("returns 400 invalid-body when phase is not a valid Phase", async () => {
    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "bogus",
      }) as never,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid-body");
  });

  it("returns 404 unknown-build when the token does not match any row", async () => {
    state.queue = null;
    const res = await POST(
      makeReq({
        callback_token: "no-such-token",
        idea_id: IDEA_ID,
        phase: "generating",
      }) as never,
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("unknown-build");
    expect(lastQueueUpdate).toBeNull();
  });

  it("returns 404 unknown-build when token matches but idea_id mismatches", async () => {
    state.queue = { ...BASE_QUEUE };
    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: "different-idea",
        phase: "generating",
      }) as never,
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("unknown-build");
    expect(lastQueueUpdate).toBeNull();
  });

  // ─── 2. Terminal-state idempotency ─────────────────────────────────

  it("returns 409 build-already-terminal when status is 'complete'", async () => {
    state.queue = { ...BASE_QUEUE, status: "complete" };
    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "generating",
      }) as never,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("build-already-terminal");
    expect(body.status).toBe("complete");
    // No DB writes, no email.
    expect(lastQueueUpdate).toBeNull();
    expect(lastIdeaUpdate).toBeNull();
    expect(sendBuildNotificationMock).not.toHaveBeenCalled();
    expect(dispatchBuildMock).not.toHaveBeenCalled();
  });

  it("returns 409 build-already-terminal when status is 'failed'", async () => {
    state.queue = { ...BASE_QUEUE, status: "failed" };
    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "failed",
        error: "anything",
      }) as never,
    );
    expect(res.status).toBe(409);
    expect((await res.json()).status).toBe("failed");
    expect(lastQueueUpdate).toBeNull();
    expect(sendBuildNotificationMock).not.toHaveBeenCalled();
  });

  // ─── 3. Retry path ─────────────────────────────────────────────────

  it("first failure (retry_count=0) bumps retry, mints fresh token, dispatches, keeps in_progress", async () => {
    state.queue = { ...BASE_QUEUE, retry_count: 0 };
    state.idea = BASE_IDEA;

    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "failed",
        error: "first-fail-reason",
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      phase: "failed",
      action: "retried",
      retry_dispatched: true,
      retry_error: null,
    });

    // Queue patch: retry bumped, fresh token, build_phase reset to queued,
    // status NOT touched (stays in_progress because the update doesn't set it).
    expect(lastQueueUpdate).toMatchObject({
      retry_count: 1,
      callback_token: "fresh-retry-token-fixed",
      build_phase: "queued",
      error: "first-fail-reason",
    });
    expect(lastQueueUpdate).not.toHaveProperty("status");

    // Dispatch was called with attempt=2 and the fresh token.
    expect(dispatchBuildMock).toHaveBeenCalledTimes(1);
    const dispatchArg = dispatchBuildMock.mock.calls[0]![0] as {
      idea: IdeaRow;
      callbackToken: string;
      attempt: number;
    };
    expect(dispatchArg.callbackToken).toBe("fresh-retry-token-fixed");
    expect(dispatchArg.attempt).toBe(2);
    expect(dispatchArg.idea.id).toBe(IDEA_ID);

    // Idempotency: idea was NOT marked failed/built, no fallback email.
    expect(lastIdeaUpdate).toBeNull();
    expect(sendBuildNotificationMock).not.toHaveBeenCalled();
  });

  it("first failure reports retry_error when dispatch is not configured", async () => {
    state.queue = { ...BASE_QUEUE, retry_count: 0 };
    state.idea = BASE_IDEA;
    isDispatchConfiguredMock.mockReturnValue(false);

    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "failed",
        error: "first-fail",
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.retry_dispatched).toBe(false);
    expect(body.retry_error).toBe("dispatch-not-configured");
    expect(dispatchBuildMock).not.toHaveBeenCalled();
    // The queue row still got the fresh token / bumped retry count.
    expect(lastQueueUpdate).toMatchObject({
      retry_count: 1,
      callback_token: "fresh-retry-token-fixed",
    });
  });

  it("first failure swallows dispatch errors and reports retry_error", async () => {
    state.queue = { ...BASE_QUEUE, retry_count: 0 };
    state.idea = BASE_IDEA;
    dispatchBuildMock.mockRejectedValueOnce(new Error("github 503"));

    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "failed",
        error: "first-fail",
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.retry_dispatched).toBe(false);
    expect(body.retry_error).toBe("github 503");
  });

  it("second failure (retry_count=1) marks failed, nulls token, sends fallback email", async () => {
    state.queue = { ...BASE_QUEUE, retry_count: 1 };
    state.idea = BASE_IDEA;

    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "failed",
        error: "second-fail-reason",
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      phase: "failed",
      action: "terminal",
      retry_count: 1,
    });

    // Queue update: terminal status, build_phase failed, token nulled.
    expect(lastQueueUpdate).toMatchObject({
      status: "failed",
      build_phase: "failed",
      callback_token: null,
      error: "second-fail-reason",
    });

    // Fallback email fired with the idea row.
    expect(sendBuildNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendBuildNotificationMock).toHaveBeenCalledWith(state.idea);

    // No retry dispatch on terminal failure.
    expect(dispatchBuildMock).not.toHaveBeenCalled();
  });

  it("second failure still returns 200 when the fallback email throws", async () => {
    state.queue = { ...BASE_QUEUE, retry_count: 1 };
    state.idea = BASE_IDEA;
    sendBuildNotificationMock.mockRejectedValueOnce(new Error("smtp down"));

    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "failed",
        error: "second-fail",
      }) as never,
    );
    // Email is best-effort — the route still resolves successfully.
    expect(res.status).toBe(200);
    expect(lastQueueUpdate).toMatchObject({ status: "failed" });
  });

  // ─── 4. Phase transitions ──────────────────────────────────────────

  it("phase=generating updates only build_phase, never status", async () => {
    state.queue = { ...BASE_QUEUE, build_phase: "queued" };
    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "generating",
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, phase: "generating" });
    expect(lastQueueUpdate).toEqual({ build_phase: "generating" });
    expect(lastQueueUpdate).not.toHaveProperty("status");
    expect(lastIdeaUpdate).toBeNull();
    expect(sendBuildNotificationMock).not.toHaveBeenCalled();
  });

  it("phase=deploying updates only build_phase, never status", async () => {
    state.queue = { ...BASE_QUEUE, build_phase: "generating" };
    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "deploying",
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(lastQueueUpdate).toEqual({ build_phase: "deploying" });
    expect(lastQueueUpdate).not.toHaveProperty("status");
  });

  it("phase=complete without mvp_url returns 400 complete-requires-mvp-url", async () => {
    state.queue = { ...BASE_QUEUE };
    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "complete",
      }) as never,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("complete-requires-mvp-url");
    expect(lastIdeaUpdate).toBeNull();
    expect(lastQueueUpdate).toBeNull();
  });

  it("phase=complete with mvp_url flips idea to built and finalizes queue", async () => {
    state.queue = { ...BASE_QUEUE, build_phase: "deploying" };
    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "complete",
        mvp_url: "https://mvp-test.example.com",
        repo_url: "https://github.com/x/y",
        screenshot_url: "https://cdn.example.com/s.png",
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, phase: "complete" });

    // Idea row: status=built + urls.
    expect(lastIdeaUpdate).toEqual({
      status: "built",
      mvp_url: "https://mvp-test.example.com",
      screenshot_url: "https://cdn.example.com/s.png",
    });

    // Queue row: complete, token nulled, urls + phase set.
    expect(lastQueueUpdate).toMatchObject({
      status: "complete",
      build_phase: "complete",
      mvp_url: "https://mvp-test.example.com",
      repo_url: "https://github.com/x/y",
      callback_token: null,
    });
    expect(typeof lastQueueUpdate!.completed_at).toBe("string");
  });

  it("phase=complete rejects non-http(s) mvp_url with 400", async () => {
    state.queue = { ...BASE_QUEUE };
    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "complete",
        mvp_url: "ftp://nope.example.com",
      }) as never,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("complete-requires-mvp-url");
  });

  // ─── 5. build_logs append behaviour ────────────────────────────────

  it("appends a new log entry while preserving prior entries", async () => {
    const prior = [
      { ts: "2026-01-01T00:00:00.000Z", phase: "queued", msg: "kicked off" },
      { ts: "2026-01-01T00:01:00.000Z", phase: "generating", msg: "halfway" },
    ];
    state.queue = { ...BASE_QUEUE, build_logs: prior };

    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "deploying",
        log: "now deploying",
      }) as never,
    );
    expect(res.status).toBe(200);
    const logs = lastQueueUpdate!.build_logs as Array<{
      ts: string;
      phase: string;
      msg: string;
    }>;
    expect(logs).toHaveLength(3);
    expect(logs.slice(0, 2)).toEqual(prior);
    expect(logs[2]).toMatchObject({ phase: "deploying", msg: "now deploying" });
    expect(typeof logs[2]!.ts).toBe("string");
  });

  it("skips build_logs write when no log line is provided", async () => {
    state.queue = {
      ...BASE_QUEUE,
      build_logs: [
        { ts: "2026-01-01T00:00:00.000Z", phase: "queued", msg: "hello" },
      ],
    };
    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "generating",
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(lastQueueUpdate).toEqual({ build_phase: "generating" });
    expect(lastQueueUpdate).not.toHaveProperty("build_logs");
  });

  it("caps build_logs at 200 entries without dropping the new entry", async () => {
    // 250 prior entries → after appending, route should retain the last 199
    // of the prior + the new entry = 200 total.
    const prior = Array.from({ length: 250 }, (_, i) => ({
      ts: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
      phase: "generating",
      msg: `entry-${i}`,
    }));
    state.queue = { ...BASE_QUEUE, build_logs: prior };

    const res = await POST(
      makeReq({
        callback_token: TOKEN,
        idea_id: IDEA_ID,
        phase: "deploying",
        log: "newest",
      }) as never,
    );
    expect(res.status).toBe(200);
    const logs = lastQueueUpdate!.build_logs as Array<{
      ts: string;
      phase: string;
      msg: string;
    }>;
    expect(logs).toHaveLength(200);
    // Newest entry is preserved at the end.
    expect(logs[logs.length - 1]).toMatchObject({
      phase: "deploying",
      msg: "newest",
    });
    // The first 199 entries are the tail of the prior list (entries 51..249).
    expect(logs[0]!.msg).toBe("entry-51");
    expect(logs[198]!.msg).toBe("entry-249");
  });
});
