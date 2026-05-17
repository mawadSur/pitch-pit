// Integration tests for GET /api/cron/post-leader.
//
// This is the daily cron that tweets the current leader of the OPEN
// (still-accepting-votes) week, but only on the configured post days
// (Sun/Thu/Sat UTC). Flow:
//   1) Auth-gate via CRON_SECRET bearer.
//   2) Skip if today is not a post day (Mon/Tue/Wed/Fri UTC).
//   3) Find the open week (most-recent `weeks` row with status='open').
//   4) Find the top idea in that week — same sort order as the leaderboard.
//   5) Idempotency: skip if we've already posted for this (week × date).
//   6) If X creds aren't configured in env, log a dry-run and return 200.
//   7) Otherwise call `postTweet`, record the result in `social_posts`,
//      and return 200 with the external tweet id.
//
// Times are mocked via `vi.useFakeTimers` / `vi.setSystemTime`. The default
// "now" for the suite is Thursday 2026-05-14T17:00:00Z (a configured post day).
//
// Coverage:
//   - unauthorized (missing/wrong CRON_SECRET, no env secret) → 401
//   - not-a-post-day (e.g. Wednesday) → { skipped: "not-a-post-day", ... }
//   - happy path with X creds → calls postTweet, inserts social_posts row,
//     returns { posted: true, externalId, eventKey } with date-suffixed key
//   - dry-run-skip when readXCredsFromEnv() returns null → returns
//     { skipped: "missing-x-creds", ... } and never calls postTweet
//   - no-open-week edge case → { skipped: "no-open-week" }
//   - no-leader edge case (open week but no scored ideas yet) →
//     { skipped: "no-leader-yet" }
//   - idempotency: already-posted for this (week × date) → no tweet
//
// We mock Supabase at the module boundary by table name and the X helper
// module, matching the style used in app/api/vote/route.test.ts and
// app/api/claim-idea/route.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type WeekRow = {
  id: string;
  week_number: number;
};

type IdeaRow = {
  id: string;
  title: string;
  score: number | null;
  final_score: number | null;
  vote_count: number | null;
};

type SocialPostRow = {
  id: string;
  external_id: string | null;
};

type State = {
  week?: WeekRow | null;
  idea?: IdeaRow | null;
  existingPost?: SocialPostRow | null;
};

let state: State = {};
let lastSocialInsert: {
  channel: string;
  event_key: string;
  external_id: string | null;
  payload: { text: string; ideaId: string; weekNumber: number };
} | null = null;
let lastSocialPostsLookup: { channel?: string; event_key?: string } = {};
let lastLogInsert: {
  channel: string;
  template: string;
  week_id: string | null;
  idea_id: string | null;
  external_id: string | null;
  body: string;
  status: string;
  error?: string | null;
} | null = null;

// X module mocks.
const postTweetMock =
  vi.fn<(text: string, creds: unknown) => Promise<{ id: string }>>();
const readXCredsFromEnvMock = vi.fn<() => unknown | null>();

vi.mock("@/lib/social/x", () => ({
  postTweet: (text: string, creds: unknown) => postTweetMock(text, creds),
  readXCredsFromEnv: () => readXCredsFromEnvMock(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "weeks") {
        // .select(...).eq("status","open").order(...).limit(1).maybeSingle()
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.order = () => builder;
        builder.limit = () => builder;
        builder.maybeSingle = async () => ({
          data: state.week ?? null,
          error: null,
        });
        return builder;
      }
      if (table === "ideas") {
        // .select(...).eq("week_id",...).in("status",[...]).order × 4
        //   .limit(1).maybeSingle()
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.in = () => builder;
        builder.order = () => builder;
        builder.limit = () => builder;
        builder.maybeSingle = async () => ({
          data: state.idea ?? null,
          error: null,
        });
        return builder;
      }
      if (table === "social_posts") {
        return {
          // Idempotency lookup:
          //   .select(...).eq("channel","x").eq("event_key", k).maybeSingle()
          select: () => {
            const captured: { channel?: string; event_key?: string } = {};
            const builder: Record<string, unknown> = {};
            builder.eq = (col: string, val: string) => {
              if (col === "channel") captured.channel = val;
              if (col === "event_key") captured.event_key = val;
              return builder;
            };
            builder.maybeSingle = async () => {
              lastSocialPostsLookup = captured;
              return { data: state.existingPost ?? null, error: null };
            };
            return builder;
          },
          // Insert after a successful tweet.
          insert: async (row: {
            channel: string;
            event_key: string;
            external_id: string | null;
            payload: {
              text: string;
              ideaId: string;
              weekNumber: number;
            };
          }) => {
            lastSocialInsert = row;
            return { error: null };
          },
        };
      }
      if (table === "social_post_log") {
        return {
          insert: async (row: {
            channel: string;
            template: string;
            week_id: string | null;
            idea_id: string | null;
            external_id: string | null;
            body: string;
            status: string;
            error?: string | null;
          }) => {
            lastLogInsert = row;
            return { error: null };
          },
        };
      }
      return {};
    },
  }),
}));

// Import AFTER mocks are declared.
import { GET } from "./route";

function makeReq(headers: Record<string, string> = {}): Request {
  const h = new Headers(headers);
  return { headers: h } as unknown as Request;
}

const CRON_SECRET = "test-cron-secret-shh";

// Default "now" for the suite: Thursday 2026-05-14T17:00:00Z.
// getUTCDay() === 4 (Thursday) is one of the configured post days.
const THURSDAY = new Date("2026-05-14T17:00:00.000Z");
const THURSDAY_DATE_STR = "2026-05-14";

const OPEN_WEEK: WeekRow = { id: "week-7", week_number: 7 };
const LEADER_IDEA: IdeaRow = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "Knock It Off the Throne",
  score: 8,
  final_score: 87,
  vote_count: 42,
};
const FAKE_CREDS = {
  apiKey: "k",
  apiSecret: "s",
  accessToken: "t",
  accessTokenSecret: "ts",
};

describe("GET /api/cron/post-leader", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    state = {};
    lastSocialInsert = null;
    lastSocialPostsLookup = {};
    lastLogInsert = null;
    postTweetMock.mockReset();
    readXCredsFromEnvMock.mockReset();
    process.env.CRON_SECRET = CRON_SECRET;
    vi.useFakeTimers();
    vi.setSystemTime(THURSDAY);
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(postTweetMock).not.toHaveBeenCalled();
    expect(readXCredsFromEnvMock).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is wrong", async () => {
    const res = await GET(
      makeReq({ authorization: "Bearer not-the-right-secret" }) as never,
    );
    expect(res.status).toBe(401);
    expect(postTweetMock).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET env var is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(401);
    expect(postTweetMock).not.toHaveBeenCalled();
  });

  it("not-a-post-day: on a non-post day (Wed UTC) skips before touching the DB or X", async () => {
    // Wednesday 2026-05-13 UTC — getUTCDay() === 3, not in POST_DAYS_UTC.
    vi.setSystemTime(new Date("2026-05-13T17:00:00.000Z"));
    state.week = OPEN_WEEK;
    state.idea = LEADER_IDEA;
    readXCredsFromEnvMock.mockReturnValue(FAKE_CREDS);

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ skipped: "not-a-post-day", dayOfWeek: 3 });

    // Critical: short-circuit BEFORE any DB lookup, X call, or insert.
    expect(postTweetMock).not.toHaveBeenCalled();
    expect(readXCredsFromEnvMock).not.toHaveBeenCalled();
    expect(lastSocialInsert).toBeNull();
    expect(lastSocialPostsLookup).toEqual({});
  });

  it("happy path: posts the leader to X and records the social_posts row", async () => {
    state.week = OPEN_WEEK;
    state.idea = LEADER_IDEA;
    state.existingPost = null;
    readXCredsFromEnvMock.mockReturnValue(FAKE_CREDS);
    postTweetMock.mockResolvedValue({ id: "tweet-id-123" });

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      posted: true,
      externalId: "tweet-id-123",
      eventKey: `current-leader-week-${OPEN_WEEK.week_number}-${THURSDAY_DATE_STR}`,
    });

    // Tweet was sent exactly once with the configured creds.
    expect(postTweetMock).toHaveBeenCalledTimes(1);
    const [tweetText, credsArg] = postTweetMock.mock.calls[0];
    expect(credsArg).toBe(FAKE_CREDS);

    // Tweet copy should contain the title, the score stats, and a URL
    // including the idea id.
    expect(tweetText).toContain(LEADER_IDEA.title);
    expect(tweetText).toContain("ai: 8/10");
    expect(tweetText).toContain("42 votes");
    expect(tweetText).toContain("87/100");
    expect(tweetText).toContain(LEADER_IDEA.id);

    // social_posts insert should mirror the tweet.
    expect(lastSocialInsert).not.toBeNull();
    expect(lastSocialInsert!.channel).toBe("x");
    expect(lastSocialInsert!.event_key).toBe(
      `current-leader-week-${OPEN_WEEK.week_number}-${THURSDAY_DATE_STR}`,
    );
    expect(lastSocialInsert!.external_id).toBe("tweet-id-123");
    expect(lastSocialInsert!.payload).toEqual({
      text: tweetText,
      ideaId: LEADER_IDEA.id,
      weekNumber: OPEN_WEEK.week_number,
    });

    // Idempotency lookup ran against the right keys.
    expect(lastSocialPostsLookup).toEqual({
      channel: "x",
      event_key: `current-leader-week-${OPEN_WEEK.week_number}-${THURSDAY_DATE_STR}`,
    });

    // social_post_log row was written alongside the social_posts row.
    expect(lastLogInsert).not.toBeNull();
    expect(lastLogInsert!.channel).toBe("x");
    expect(lastLogInsert!.template).toBe("leader");
    expect(lastLogInsert!.week_id).toBe(OPEN_WEEK.id);
    expect(lastLogInsert!.idea_id).toBe(LEADER_IDEA.id);
    expect(lastLogInsert!.external_id).toBe("tweet-id-123");
    expect(lastLogInsert!.body).toBe(tweetText);
    expect(lastLogInsert!.status).toBe("posted");
  });

  it("dry-run skip: when X creds are absent, never calls postTweet and returns the would-be text", async () => {
    state.week = OPEN_WEEK;
    state.idea = LEADER_IDEA;
    state.existingPost = null;
    readXCredsFromEnvMock.mockReturnValue(null);

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.skipped).toBe("missing-x-creds");
    expect(body.eventKey).toBe(
      `current-leader-week-${OPEN_WEEK.week_number}-${THURSDAY_DATE_STR}`,
    );
    // The route returns the rendered tweet so an operator can see what
    // would have been posted.
    expect(typeof body.text).toBe("string");
    expect(body.text).toContain(LEADER_IDEA.title);

    // Critical: no tweet went out, no social_posts row was written.
    expect(postTweetMock).not.toHaveBeenCalled();
    expect(lastSocialInsert).toBeNull();
  });

  it("no-open-week: returns { skipped: 'no-open-week' } and never tweets", async () => {
    state.week = null;

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ skipped: "no-open-week" });

    expect(postTweetMock).not.toHaveBeenCalled();
    expect(readXCredsFromEnvMock).not.toHaveBeenCalled();
    expect(lastSocialInsert).toBeNull();
  });

  it("no-leader-yet: open week exists but no scored ideas — skips without tweeting", async () => {
    state.week = OPEN_WEEK;
    state.idea = null;

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ skipped: "no-leader-yet" });

    expect(postTweetMock).not.toHaveBeenCalled();
    expect(readXCredsFromEnvMock).not.toHaveBeenCalled();
    expect(lastSocialInsert).toBeNull();
  });

  it("idempotency: if a social_posts row for this week already exists, skip without tweeting", async () => {
    state.week = OPEN_WEEK;
    state.idea = LEADER_IDEA;
    state.existingPost = {
      id: "post-1",
      external_id: "tweet-id-original",
    };
    // creds are configured — but we shouldn't get that far.
    readXCredsFromEnvMock.mockReturnValue(FAKE_CREDS);

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      skipped: "already-posted",
      eventKey: `current-leader-week-${OPEN_WEEK.week_number}-${THURSDAY_DATE_STR}`,
    });

    // Idempotency means: no second tweet, no second insert, and the
    // creds reader isn't even consulted (the route short-circuits
    // before reaching that step).
    expect(postTweetMock).not.toHaveBeenCalled();
    expect(readXCredsFromEnvMock).not.toHaveBeenCalled();
    expect(lastSocialInsert).toBeNull();
  });

  it("returns 500 when postTweet throws (and does NOT insert a social_posts row)", async () => {
    state.week = OPEN_WEEK;
    state.idea = LEADER_IDEA;
    state.existingPost = null;
    readXCredsFromEnvMock.mockReturnValue(FAKE_CREDS);
    postTweetMock.mockRejectedValue(new Error("X API 403: locked"));

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("x-post-failed");
    expect(body.message).toBe("X API 403: locked");

    // The tweet attempt happened, but no social_posts row was written —
    // otherwise idempotency would block a future retry. The failed
    // attempt IS recorded in social_post_log for forensics.
    expect(postTweetMock).toHaveBeenCalledTimes(1);
    expect(lastSocialInsert).toBeNull();
    expect(lastLogInsert).not.toBeNull();
    expect(lastLogInsert!.template).toBe("leader");
    expect(lastLogInsert!.status).toBe("failed");
    expect(lastLogInsert!.external_id).toBeNull();
    expect(lastLogInsert!.error).toBe("X API 403: locked");
  });
});
