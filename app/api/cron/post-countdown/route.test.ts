// Integration tests for GET /api/cron/post-countdown.
//
// Sunday 6 PM ET ("X hours until the pit closes…") tweet. Flow:
//   1) Auth-gate via CRON_SECRET bearer.
//   2) Find the currently-open week.
//   3) Idempotency: skip if social_post_log already has a `posted`
//      row for (channel='x', template='countdown', week_id=current).
//   4) Count scored/queued/building/built ideas in the open week.
//   5) Build the tweet text from hours-left + pitch count.
//   6) If X creds aren't configured, log a dry-run and return 200
//      WITHOUT writing a social_post_log row (this run never tried).
//   7) Otherwise call postTweet:
//        - success → log row with status='posted' + external_id, 200
//        - failure → log row with status='failed' + error, 200 {posted:false}
//
// Coverage:
//   - 401 unauth (missing/wrong CRON_SECRET, unset env secret)
//   - no-open-week → { skipped: 'no-open-week' }
//   - idempotency → already-posted log row blocks tweet
//   - dry-run skip when creds missing
//   - happy path → calls postTweet, writes posted log row
//   - X API failure → returns 200 posted:false, writes failed log row

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type WeekRow = {
  id: string;
  week_number: number;
  end_at: string;
};

type LogRow = {
  id: string;
  external_id: string | null;
};

type State = {
  week?: WeekRow | null;
  existingLog?: LogRow | null;
  pitchCount?: number;
};

let state: State = {};
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
let lastIdeasQuery: { week_id?: string; statuses?: string[] } = {};

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
        // .select("id", { count: 'exact', head: true })
        //   .eq("week_id", id).in("status", [...])
        const captured: { week_id?: string; statuses?: string[] } = {};
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = (col: string, val: string) => {
          if (col === "week_id") captured.week_id = val;
          return builder;
        };
        builder.in = (col: string, vals: string[]) => {
          if (col === "status") captured.statuses = vals;
          return builder;
        };
        // Awaited form returns { count, data, error }.
        builder.then = (resolve: (v: unknown) => unknown) => {
          lastIdeasQuery = captured;
          return Promise.resolve({
            count: state.pitchCount ?? 0,
            data: null,
            error: null,
          }).then(resolve);
        };
        return builder;
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

// Default "now" = Sun 2026-05-17T23:00:00Z (Sun 6 PM EST winter / 7 PM EDT).
const SUNDAY_6PM = new Date("2026-05-17T23:00:00.000Z");
// Week ends Tue 2026-05-19T04:00:00Z → 29h left from SUNDAY_6PM.
const OPEN_WEEK: WeekRow = {
  id: "week-7",
  week_number: 7,
  end_at: "2026-05-19T04:00:00.000Z",
};
const FAKE_CREDS = {
  apiKey: "k",
  apiSecret: "s",
  accessToken: "t",
  accessTokenSecret: "ts",
};

describe("GET /api/cron/post-countdown", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    state = {};
    lastLogInsert = null;
    lastLogLookup = {};
    lastIdeasQuery = {};
    postTweetMock.mockReset();
    readXCredsFromEnvMock.mockReset();
    process.env.CRON_SECRET = CRON_SECRET;
    vi.useFakeTimers();
    vi.setSystemTime(SUNDAY_6PM);
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
    expect(lastLogInsert).toBeNull();
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
    expect(lastLogInsert).toBeNull();
  });

  it("happy path: posts countdown to X and writes a posted log row", async () => {
    state.week = OPEN_WEEK;
    state.existingLog = null;
    state.pitchCount = 12;
    readXCredsFromEnvMock.mockReturnValue(FAKE_CREDS);
    postTweetMock.mockResolvedValue({ id: "tweet-countdown-555" });

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      posted: true,
      externalId: "tweet-countdown-555",
      weekId: OPEN_WEEK.id,
    });

    // Tweet body should mention hours remaining + pitch count.
    expect(postTweetMock).toHaveBeenCalledTimes(1);
    const [tweetText, credsArg] = postTweetMock.mock.calls[0];
    expect(credsArg).toBe(FAKE_CREDS);
    // 29 hours from SUNDAY_6PM to end_at.
    expect(tweetText).toContain("29 hours");
    expect(tweetText).toContain("12 pitches");
    expect(tweetText).toContain("pitchpit.app");

    // Ideas query filtered to the open week + in-play statuses.
    expect(lastIdeasQuery.week_id).toBe(OPEN_WEEK.id);
    expect(lastIdeasQuery.statuses).toEqual([
      "scored",
      "queued",
      "building",
      "built",
    ]);

    // Idempotency lookup keyed correctly.
    expect(lastLogLookup).toEqual({
      channel: "x",
      template: "countdown",
      week_id: OPEN_WEEK.id,
      status: "posted",
    });

    // Posted log row written with the right shape.
    expect(lastLogInsert).not.toBeNull();
    expect(lastLogInsert!.channel).toBe("x");
    expect(lastLogInsert!.template).toBe("countdown");
    expect(lastLogInsert!.week_id).toBe(OPEN_WEEK.id);
    expect(lastLogInsert!.idea_id).toBeNull();
    expect(lastLogInsert!.external_id).toBe("tweet-countdown-555");
    expect(lastLogInsert!.body).toBe(tweetText);
    expect(lastLogInsert!.status).toBe("posted");
  });

  it("idempotency: existing posted log row blocks a second tweet", async () => {
    state.week = OPEN_WEEK;
    state.existingLog = {
      id: "log-1",
      external_id: "tweet-countdown-555",
    };
    state.pitchCount = 5;
    readXCredsFromEnvMock.mockReturnValue(FAKE_CREDS);

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      skipped: "already-posted",
      weekId: OPEN_WEEK.id,
      externalId: "tweet-countdown-555",
    });

    expect(postTweetMock).not.toHaveBeenCalled();
    expect(readXCredsFromEnvMock).not.toHaveBeenCalled();
    expect(lastLogInsert).toBeNull();
  });

  it("dry-run skip: X creds missing → returns text, never tweets, no log row", async () => {
    state.week = OPEN_WEEK;
    state.existingLog = null;
    state.pitchCount = 7;
    readXCredsFromEnvMock.mockReturnValue(null);

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe("missing-x-creds");
    expect(body.weekId).toBe(OPEN_WEEK.id);
    expect(typeof body.text).toBe("string");
    expect(body.text).toContain("29 hours");

    expect(postTweetMock).not.toHaveBeenCalled();
    expect(lastLogInsert).toBeNull();
  });

  it("X API failure: returns 200 posted:false and writes a failed log row", async () => {
    state.week = OPEN_WEEK;
    state.existingLog = null;
    state.pitchCount = 9;
    readXCredsFromEnvMock.mockReturnValue(FAKE_CREDS);
    postTweetMock.mockRejectedValue(new Error("X API 503: rate-limited"));

    const res = await GET(
      makeReq({ authorization: `Bearer ${CRON_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posted).toBe(false);
    expect(body.error).toBe("X API 503: rate-limited");
    expect(body.weekId).toBe(OPEN_WEEK.id);

    expect(postTweetMock).toHaveBeenCalledTimes(1);

    // Failed attempt recorded for forensics.
    expect(lastLogInsert).not.toBeNull();
    expect(lastLogInsert!.channel).toBe("x");
    expect(lastLogInsert!.template).toBe("countdown");
    expect(lastLogInsert!.week_id).toBe(OPEN_WEEK.id);
    expect(lastLogInsert!.idea_id).toBeNull();
    expect(lastLogInsert!.external_id).toBeNull();
    expect(lastLogInsert!.status).toBe("failed");
    expect(lastLogInsert!.error).toBe("X API 503: rate-limited");
    expect(lastLogInsert!.body).toContain("9 pitches");
  });
});
