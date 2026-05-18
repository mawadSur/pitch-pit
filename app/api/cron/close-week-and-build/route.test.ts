// Integration tests for GET /api/cron/close-week-and-build.
//
// This is the weekly cron that:
//   1) Idempotently calls the `close_current_week` Postgres RPC to mark the
//      open week closed and pick the highest-final_score winner.
//   2) Looks up the most-recent closed week with a winner picked.
//   3) Fetches the winner idea, advances it to 'building', upserts a row
//      into `build_queue`, and fires the build-notification email.
//
// Coverage:
//   - unauthorized (no/bad CRON_SECRET, no Authorization header) → 401
//   - happy path → idea moved to building, queue upserted, email sent, 200
//   - idempotency: when the winner is already in 'building'/'built' state,
//     no second status update, no second email
//   - no-active-week edge case: RPC succeeds but no closed week with a
//     winner exists yet → 200 + { skipped: "no-closed-week-with-winner" }
//
// We mock the Supabase admin client at the module boundary and dispatch
// on table name + RPC name, matching the style in
// app/api/vote/route.test.ts and app/api/claim-idea/route.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type IdeaRow = {
  id: string;
  title: string;
  pitch: string;
  score: number | null;
  final_score: number | null;
  verdict: string | null;
  strengths: string[] | null;
  concerns: string[] | null;
  reasoning: string | null;
  status: string;
};

type ClosedWeekRow = {
  id: string;
  week_number: number;
  winner_idea_id: string | null;
} | null;

type State = {
  rpcError?: { message: string } | null;
  closedWeek?: ClosedWeekRow;
  idea?: IdeaRow | null;
  ideaFetchError?: { message: string } | null;
  updateIdeaError?: { message: string } | null;
  queueError?: { message: string } | null;
};

let state: State = {};
let rpcCalls: string[] = [];
let lastIdeaUpdate: Partial<IdeaRow> | null = null;
let lastQueueUpsert:
  | {
      row: {
        idea_id: string;
        status: string;
        approved_at: string;
        started_at: string;
        callback_token?: string;
        retry_count?: number;
        build_phase?: string;
        build_logs?: unknown[];
      };
      opts: unknown;
    }
  | null = null;

const sendBuildNotificationMock =
  vi.fn<(idea: IdeaRow) => Promise<void>>();
const dispatchBuildMock = vi.fn<() => Promise<void>>();
const isDispatchConfiguredMock = vi.fn<() => boolean>();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string) => {
      rpcCalls.push(name);
      // record_cron_heartbeat is a fire-and-forget observability write; the
      // route's writeHeartbeat helper swallows errors. We always succeed it
      // here so a failing rpcError state for `close_current_week` doesn't
      // accidentally exercise the heartbeat error path too.
      if (name === "record_cron_heartbeat") return { error: null };
      return { error: state.rpcError ?? null };
    },
    from: (table: string) => {
      if (table === "weeks") {
        // .select(...).eq(...).not(...).order(...).limit(1).maybeSingle()
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.not = () => builder;
        builder.order = () => builder;
        builder.limit = () => builder;
        builder.maybeSingle = async () => ({
          data: state.closedWeek ?? null,
          error: null,
        });
        return builder;
      }
      if (table === "ideas") {
        // Two shapes: SELECT(...).eq(...).single()
        //         and UPDATE(...).eq(...)
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: state.idea ?? null,
                error: state.ideaFetchError ?? null,
              }),
            }),
          }),
          update: (patch: Partial<IdeaRow>) => {
            lastIdeaUpdate = patch;
            return {
              eq: async () => ({ error: state.updateIdeaError ?? null }),
            };
          },
        };
      }
      if (table === "build_queue") {
        return {
          upsert: async (
            row: {
              idea_id: string;
              status: string;
              approved_at: string;
              started_at: string;
            },
            opts: unknown,
          ) => {
            lastQueueUpsert = { row, opts };
            return { error: state.queueError ?? null };
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
  dispatchBuild: () => dispatchBuildMock(),
  isDispatchConfigured: () => isDispatchConfiguredMock(),
  // mintCallbackToken is deterministic in tests so the upsert payload is
  // predictable. Real implementation uses crypto.getRandomValues.
  mintCallbackToken: () => "test-callback-token-fixed",
}));

// Import AFTER the mocks are declared.
import { GET } from "./route";

// Minimal NextRequest stand-in. The route only reads
// `req.headers.get("authorization")`, so a stub with a Headers object is
// enough — matches the body-only stubs used in the sibling tests.
function makeReq(headers: Record<string, string> = {}): Request {
  const h = new Headers(headers);
  return { headers: h } as unknown as Request;
}

const CRON_SECRET = "test-cron-secret-shh";

const WINNER_IDEA: IdeaRow = {
  id: "idea-winner-1",
  title: "The People's Pitch",
  pitch: "A pitch.",
  score: 9,
  final_score: 92,
  verdict: "built",
  strengths: ["wedge", "timing"],
  concerns: ["distribution"],
  reasoning: "tight wedge, real urgency",
  status: "scored",
};

const CLOSED_WEEK: NonNullable<ClosedWeekRow> = {
  id: "week-1",
  week_number: 1,
  winner_idea_id: WINNER_IDEA.id,
};

describe("GET /api/cron/close-week-and-build", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    state = {};
    rpcCalls = [];
    lastIdeaUpdate = null;
    lastQueueUpsert = null;
    sendBuildNotificationMock.mockReset();
    sendBuildNotificationMock.mockResolvedValue(undefined);
    dispatchBuildMock.mockReset();
    dispatchBuildMock.mockResolvedValue(undefined);
    isDispatchConfiguredMock.mockReset();
    // Default: dispatch is configured so the happy-path test exercises it.
    isDispatchConfiguredMock.mockReturnValue(true);
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    // Should not have touched Supabase or email at all.
    expect(rpcCalls).toEqual([]);
    expect(sendBuildNotificationMock).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is wrong", async () => {
    const res = await GET(
      makeReq({ authorization: "Bearer not-the-right-secret" }) as never,
    );
    expect(res.status).toBe(401);
    expect(rpcCalls).toEqual([]);
  });

  it("returns 401 when CRON_SECRET env var is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(401);
    expect(rpcCalls).toEqual([]);
  });

  it("happy path: closes week, advances winner to building, queues, emails", async () => {
    state.closedWeek = CLOSED_WEEK;
    state.idea = { ...WINNER_IDEA, status: "scored" };

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      closed: CLOSED_WEEK.week_number,
      winner: {
        id: WINNER_IDEA.id,
        title: WINNER_IDEA.title,
        final_score: WINNER_IDEA.final_score,
      },
      email_sent: true,
      dispatch_sent: true,
      dispatch_error: null,
    });

    // 1. The close_current_week RPC was invoked.
    // The route also writes a heartbeat via the record_cron_heartbeat RPC
    // before returning; filter that out so the assertion focuses on the
    // business RPC. Heartbeat presence is covered in cron-heartbeat tests.
    expect(rpcCalls.filter((n) => n !== "record_cron_heartbeat")).toEqual([
      "close_current_week",
    ]);

    // 2. The idea was patched to 'building'.
    expect(lastIdeaUpdate).toEqual({ status: "building" });

    // 3. build_queue got an in_progress row keyed by idea_id with both
    //    approved_at and started_at populated, plus the callback token
    //    and a fresh build_phase='queued' / retry_count=0.
    expect(lastQueueUpsert).not.toBeNull();
    expect(lastQueueUpsert!.row.idea_id).toBe(WINNER_IDEA.id);
    expect(lastQueueUpsert!.row.status).toBe("in_progress");
    expect(typeof lastQueueUpsert!.row.approved_at).toBe("string");
    expect(typeof lastQueueUpsert!.row.started_at).toBe("string");
    expect(lastQueueUpsert!.row.callback_token).toBe("test-callback-token-fixed");
    expect(lastQueueUpsert!.row.retry_count).toBe(0);
    expect(lastQueueUpsert!.row.build_phase).toBe("queued");
    expect(lastQueueUpsert!.row.build_logs).toEqual([]);
    expect(lastQueueUpsert!.opts).toMatchObject({ onConflict: "idea_id" });

    // 4. Email was sent exactly once with the winner idea.
    expect(sendBuildNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendBuildNotificationMock).toHaveBeenCalledWith(state.idea);

    // 5. Dispatch fired exactly once after the email.
    expect(dispatchBuildMock).toHaveBeenCalledTimes(1);
  });

  it("idempotency: when winner is already 'building', no re-update and no email", async () => {
    state.closedWeek = CLOSED_WEEK;
    state.idea = { ...WINNER_IDEA, status: "building" };

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      closed: CLOSED_WEEK.week_number,
      winner: {
        id: WINNER_IDEA.id,
        title: WINNER_IDEA.title,
        status: "building",
      },
      email_sent: false,
      note: "already-building-or-built",
    });

    // RPC still runs (it's a no-op when there's no open week, and this is
    // the documented "safe to call repeatedly" contract).
    // The route also writes a heartbeat via the record_cron_heartbeat RPC
    // before returning; filter that out so the assertion focuses on the
    // business RPC. Heartbeat presence is covered in cron-heartbeat tests.
    expect(rpcCalls.filter((n) => n !== "record_cron_heartbeat")).toEqual([
      "close_current_week",
    ]);

    // But the idempotency guard short-circuited before update/queue/email.
    expect(lastIdeaUpdate).toBeNull();
    expect(lastQueueUpsert).toBeNull();
    expect(sendBuildNotificationMock).not.toHaveBeenCalled();
  });

  it("idempotency: when winner is already 'built', no re-update and no email", async () => {
    state.closedWeek = CLOSED_WEEK;
    state.idea = { ...WINNER_IDEA, status: "built" };

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note).toBe("already-building-or-built");
    expect(body.email_sent).toBe(false);
    expect(body.winner.status).toBe("built");

    expect(lastIdeaUpdate).toBeNull();
    expect(lastQueueUpsert).toBeNull();
    expect(sendBuildNotificationMock).not.toHaveBeenCalled();
  });

  it("no-active-week edge case: RPC ran but no closed week with a winner exists", async () => {
    state.closedWeek = null; // no closed-with-winner row found

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ skipped: "no-closed-week-with-winner" });

    // The RPC still ran (idempotent close-week call). We just had nothing
    // to act on afterwards.
    // The route also writes a heartbeat via the record_cron_heartbeat RPC
    // before returning; filter that out so the assertion focuses on the
    // business RPC. Heartbeat presence is covered in cron-heartbeat tests.
    expect(rpcCalls.filter((n) => n !== "record_cron_heartbeat")).toEqual([
      "close_current_week",
    ]);

    // No idea update, no queue write, no email.
    expect(lastIdeaUpdate).toBeNull();
    expect(lastQueueUpsert).toBeNull();
    expect(sendBuildNotificationMock).not.toHaveBeenCalled();
  });

  it("propagates a 500 when the close_current_week RPC errors", async () => {
    state.rpcError = { message: "RPC blew up" };

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("close_current_week-failed");
    expect(body.message).toBe("RPC blew up");

    // The route also writes a heartbeat via the record_cron_heartbeat RPC
    // before returning; filter that out so the assertion focuses on the
    // business RPC. Heartbeat presence is covered in cron-heartbeat tests.
    expect(rpcCalls.filter((n) => n !== "record_cron_heartbeat")).toEqual([
      "close_current_week",
    ]);
    expect(lastIdeaUpdate).toBeNull();
    expect(sendBuildNotificationMock).not.toHaveBeenCalled();
  });

  it("still returns 200 (email_sent=false) when the build-notification email throws", async () => {
    state.closedWeek = CLOSED_WEEK;
    state.idea = { ...WINNER_IDEA, status: "scored" };
    sendBuildNotificationMock.mockRejectedValueOnce(new Error("smtp down"));

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    // Email is best-effort — the build still moves forward.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email_sent).toBe(false);
    expect(body.winner.id).toBe(WINNER_IDEA.id);

    // The status update and queue write must still have happened — we
    // only swallow the email failure.
    expect(lastIdeaUpdate).toEqual({ status: "building" });
    expect(lastQueueUpsert).not.toBeNull();

    // Dispatch is independent of the email: it should still have fired.
    expect(dispatchBuildMock).toHaveBeenCalledTimes(1);
  });

  it("returns dispatch_sent=false with an error when the GitHub dispatch throws", async () => {
    state.closedWeek = CLOSED_WEEK;
    state.idea = { ...WINNER_IDEA, status: "scored" };
    dispatchBuildMock.mockRejectedValueOnce(new Error("github 503"));

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    // Dispatch is best-effort — the queue row and email already give
    // a fallback path, so the cron itself still returns 200.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email_sent).toBe(true);
    expect(body.dispatch_sent).toBe(false);
    expect(body.dispatch_error).toBe("github 503");

    // The queue row was still written so the /winner page can render.
    expect(lastQueueUpsert).not.toBeNull();
  });

  it("returns dispatch_error='dispatch-not-configured' when env vars are missing", async () => {
    isDispatchConfiguredMock.mockReturnValue(false);
    state.closedWeek = CLOSED_WEEK;
    state.idea = { ...WINNER_IDEA, status: "scored" };

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dispatch_sent).toBe(false);
    expect(body.dispatch_error).toBe("dispatch-not-configured");

    // Dispatch must not be attempted when not configured.
    expect(dispatchBuildMock).not.toHaveBeenCalled();
    // Email + queue still happen — the manual fallback path is intact.
    expect(sendBuildNotificationMock).toHaveBeenCalledTimes(1);
    expect(lastQueueUpsert).not.toBeNull();
  });
});
