// Integration tests for GET /api/cron/post-winner.
//
// This is the weekly cron that tweets the CLOSED week's winner — fires once
// per week after close-week-and-build picks the winner. Flow:
//   1) Auth-gate via CRON_SECRET bearer.
//   2) Find the most-recently-closed week that has a winner_idea_id.
//   3) Idempotency: skip if we've already posted for this week's event_key.
//   4) Load the winner idea row.
//   5) If X creds aren't configured, log a dry-run and return 200.
//   6) Otherwise call `postTweet`, record the result in `social_posts`,
//      and return 200 with the external tweet id.
//
// Coverage:
//   - unauthorized (missing/wrong CRON_SECRET, no env secret) → 401
//   - happy path with X creds → calls postTweet, inserts social_posts row,
//     returns { posted: true, externalId, eventKey }
//   - dry-run-skip when readXCredsFromEnv() returns null → returns
//     { skipped: "missing-x-creds", ... } and never calls postTweet
//   - no-closed-week edge case → { skipped: "no-closed-week-with-winner" }
//   - winner-idea-missing edge case (closed row points at a deleted idea)
//   - idempotency: already-posted for this week → no tweet
//   - postTweet throws → 500, no social_posts insert
//
// Mocks Supabase at the module boundary by table name and the X helper
// module — same harness shape as app/api/cron/post-leader/route.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type WeekRow = {
  id: string;
  week_number: number;
  winner_idea_id: string | null;
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
  existingLog?: SocialPostRow | null;
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
let lastLogLookup: {
  channel?: string;
  template?: string;
  week_id?: string;
  status?: string;
} = {};

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
        // .select(...).eq("status","closed").not("winner_idea_id","is",null)
        //   .order(...).limit(1).maybeSingle()
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.not = () => builder;
        builder.order = () => builder;
        builder.limit = () => builder;
        builder.maybeSingle = async () => ({
          data: state.week ?? null,
          error: null,
        });
        return builder;
      }
      if (table === "ideas") {
        // .select(...).eq("id", winnerId).maybeSingle()
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.maybeSingle = async () => ({
          data: state.idea ?? null,
          error: null,
        });
        return builder;
      }
      if (table === "social_posts") {
        return {
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
          select: () => {
            const captured: {
              channel?: string;
              template?: string;
              week_id?: string;
              status?: string;
            } = {};
            const builder: Record<string, unknown> = {};
            builder.eq = (col: string, val: string) => {
              if (col === "channel") captured.channel = val;
              if (col === "template") captured.template = val;
              if (col === "week_id") captured.week_id = val;
              if (col === "status") captured.status = val;
              return builder;
            };
            builder.maybeSingle = async () => {
              lastLogLookup = captured;
              return { data: state.existingLog ?? null, error: null };
            };
            return builder;
          },
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

import { GET } from "./route";

function makeReq(headers: Record<string, string> = {}): Request {
  const h = new Headers(headers);
  return { headers: h } as unknown as Request;
}

const CRON_SECRET = "test-cron-secret-shh";

const CLOSED_WEEK_WITH_WINNER: WeekRow = {
  id: "week-6",
  week_number: 6,
  winner_idea_id: "550e8400-e29b-41d4-a716-446655440000",
};
const WINNER_IDEA: IdeaRow = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "To The Victor Go The Tokens",
  score: 9,
  final_score: 94,
  vote_count: 57,
};
const FAKE_CREDS = {
  apiKey: "k",
  apiSecret: "s",
  accessToken: "t",
  accessTokenSecret: "ts",
};

describe("GET /api/cron/post-winner", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    state = {};
    lastSocialInsert = null;
    lastSocialPostsLookup = {};
    lastLogInsert = null;
    lastLogLookup = {};
    postTweetMock.mockReset();
    readXCredsFromEnvMock.mockReset();
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

  it("happy path: posts the winner to X and records the social_posts row", async () => {
    state.week = CLOSED_WEEK_WITH_WINNER;
    state.idea = WINNER_IDEA;
    state.existingPost = null;
    readXCredsFromEnvMock.mockReturnValue(FAKE_CREDS);
    postTweetMock.mockResolvedValue({ id: "tweet-winner-789" });

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      posted: true,
      externalId: "tweet-winner-789",
      eventKey: `winner-week-${CLOSED_WEEK_WITH_WINNER.week_number}`,
    });

    expect(postTweetMock).toHaveBeenCalledTimes(1);
    const [tweetText, credsArg] = postTweetMock.mock.calls[0];
    expect(credsArg).toBe(FAKE_CREDS);

    // Tweet copy should announce the winner with the title + stats + URL.
    expect(tweetText).toContain(WINNER_IDEA.title);
    expect(tweetText).toContain("winner");
    expect(tweetText).toContain("ai: 9/10");
    expect(tweetText).toContain("votes: 57");
    expect(tweetText).toContain("final: 94/100");
    expect(tweetText).toContain(WINNER_IDEA.id);

    expect(lastSocialInsert).not.toBeNull();
    expect(lastSocialInsert!.channel).toBe("x");
    expect(lastSocialInsert!.event_key).toBe(
      `winner-week-${CLOSED_WEEK_WITH_WINNER.week_number}`,
    );
    expect(lastSocialInsert!.external_id).toBe("tweet-winner-789");
    expect(lastSocialInsert!.payload).toEqual({
      text: tweetText,
      ideaId: WINNER_IDEA.id,
      weekNumber: CLOSED_WEEK_WITH_WINNER.week_number,
    });

    expect(lastSocialPostsLookup).toEqual({
      channel: "x",
      event_key: `winner-week-${CLOSED_WEEK_WITH_WINNER.week_number}`,
    });

    // social_post_log idempotency lookup keyed by (channel, template, week_id, status).
    expect(lastLogLookup).toEqual({
      channel: "x",
      template: "winner",
      week_id: CLOSED_WEEK_WITH_WINNER.id,
      status: "posted",
    });

    // social_post_log row was written alongside the social_posts row.
    expect(lastLogInsert).not.toBeNull();
    expect(lastLogInsert!.channel).toBe("x");
    expect(lastLogInsert!.template).toBe("winner");
    expect(lastLogInsert!.week_id).toBe(CLOSED_WEEK_WITH_WINNER.id);
    expect(lastLogInsert!.idea_id).toBe(WINNER_IDEA.id);
    expect(lastLogInsert!.external_id).toBe("tweet-winner-789");
    expect(lastLogInsert!.body).toBe(tweetText);
    expect(lastLogInsert!.status).toBe("posted");
  });

  it("dry-run skip: when X creds are absent, never calls postTweet and returns the would-be text", async () => {
    state.week = CLOSED_WEEK_WITH_WINNER;
    state.idea = WINNER_IDEA;
    state.existingPost = null;
    readXCredsFromEnvMock.mockReturnValue(null);

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.skipped).toBe("missing-x-creds");
    expect(body.eventKey).toBe(
      `winner-week-${CLOSED_WEEK_WITH_WINNER.week_number}`,
    );
    expect(typeof body.text).toBe("string");
    expect(body.text).toContain(WINNER_IDEA.title);

    expect(postTweetMock).not.toHaveBeenCalled();
    expect(lastSocialInsert).toBeNull();
  });

  it("no-closed-week-with-winner: skips when no eligible week exists", async () => {
    state.week = null;

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ skipped: "no-closed-week-with-winner" });

    expect(postTweetMock).not.toHaveBeenCalled();
    expect(readXCredsFromEnvMock).not.toHaveBeenCalled();
    expect(lastSocialInsert).toBeNull();
  });

  it("winner-idea-missing: closed week points at an idea row that's gone — skip without tweeting", async () => {
    state.week = CLOSED_WEEK_WITH_WINNER;
    state.idea = null;
    state.existingPost = null;

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ skipped: "winner-idea-missing" });

    expect(postTweetMock).not.toHaveBeenCalled();
    expect(readXCredsFromEnvMock).not.toHaveBeenCalled();
    expect(lastSocialInsert).toBeNull();
  });

  it("idempotency: if a social_posts row for this week's winner already exists, skip without tweeting", async () => {
    state.week = CLOSED_WEEK_WITH_WINNER;
    state.idea = WINNER_IDEA;
    state.existingPost = {
      id: "post-1",
      external_id: "tweet-id-original",
    };
    readXCredsFromEnvMock.mockReturnValue(FAKE_CREDS);

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      skipped: "already-posted",
      eventKey: `winner-week-${CLOSED_WEEK_WITH_WINNER.week_number}`,
    });

    expect(postTweetMock).not.toHaveBeenCalled();
    expect(readXCredsFromEnvMock).not.toHaveBeenCalled();
    expect(lastSocialInsert).toBeNull();
  });

  it("returns 500 when postTweet throws (and does NOT insert a social_posts row)", async () => {
    state.week = CLOSED_WEEK_WITH_WINNER;
    state.idea = WINNER_IDEA;
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

    // The tweet attempt happened, but no DB row was written —
    // otherwise idempotency would block a future retry.
    expect(postTweetMock).toHaveBeenCalledTimes(1);
    expect(lastSocialInsert).toBeNull();
  });
});
