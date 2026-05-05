// Integration tests for POST /api/pitch-coach.
//
// Auth-gated route that dispatches to either renderFollowups or
// renderEnhanced depending on the `action` field. We mock at the module
// boundary so the handler's branching, validation, and error reporting
// can be exercised without hitting Anthropic or Supabase.

import { describe, it, expect, vi, beforeEach } from "vitest";

type CookieMock = {
  user?: { id: string } | null;
};

let cookieState: CookieMock = {};

const renderFollowupsMock = vi.fn<(pitch: string) => Promise<string[]>>();
const renderEnhancedMock = vi.fn<(pitch: string) => Promise<string>>();
const captureExceptionMock = vi.fn();
const limitCoachCallsMock = vi.fn<
  (userId: string) => Promise<{
    success: boolean;
    remaining: number;
    reset: number;
    limit: number;
  }>
>();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: cookieState.user ?? null },
      }),
    },
  }),
}));

vi.mock("@/lib/coach/render", () => ({
  renderFollowups: (pitch: string) => renderFollowupsMock(pitch),
  renderEnhanced: (pitch: string) => renderEnhancedMock(pitch),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

vi.mock("@/lib/ratelimit", () => ({
  limitCoachCalls: (userId: string) => limitCoachCallsMock(userId),
}));

// Import AFTER mocks are declared.
import { POST } from "./route";

// Minimal stand-in for NextRequest. The route only calls `req.json()`,
// so a stub with that one method matches the existing pattern in
// app/api/vote/route.test.ts and app/api/claim-idea/route.test.ts.
function makeReq(body: unknown): Request {
  return {
    json: async () => {
      if (typeof body === "string" && body === "__BAD_JSON__") {
        throw new SyntaxError("Unexpected token in JSON");
      }
      return body;
    },
  } as unknown as Request;
}

// 80-char filler pitch — comfortably above the 40-char minimum but not
// long enough to trip the 1500-char ceiling. Re-used across cases that
// just need a "valid-shaped" pitch.
const VALID_PITCH =
  "We help indie founders ship MVPs in a weekend by automating boilerplate setup-x.";

describe("POST /api/pitch-coach", () => {
  beforeEach(() => {
    cookieState = {};
    renderFollowupsMock.mockReset();
    renderEnhancedMock.mockReset();
    captureExceptionMock.mockReset();
    limitCoachCallsMock.mockReset();
    // Default: limiter passes. Tests that exercise the rate-limited
    // path override this in their own setup.
    limitCoachCallsMock.mockResolvedValue({
      success: true,
      remaining: 19,
      reset: Date.now() + 600_000,
      limit: 20,
    });
  });

  it("returns 401 when not signed in", async () => {
    cookieState.user = null;
    const res = await POST(
      makeReq({ pitch: VALID_PITCH, action: "followups" }) as never,
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.category).toBe("auth");
    expect(typeof body.redirect_to).toBe("string");
    expect(body.redirect_to).toContain("/login?next=");
    expect(renderFollowupsMock).not.toHaveBeenCalled();
    expect(renderEnhancedMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON body", async () => {
    cookieState.user = { id: "user-a" };
    const res = await POST(makeReq("__BAD_JSON__") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 for missing required fields", async () => {
    cookieState.user = { id: "user-a" };
    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.details).toBeTruthy();
  });

  it("returns 400 for too-short pitch", async () => {
    cookieState.user = { id: "user-a" };
    const res = await POST(
      makeReq({ pitch: "short", action: "followups" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid action enum", async () => {
    cookieState.user = { id: "user-a" };
    const res = await POST(
      makeReq({ pitch: VALID_PITCH, action: "rewrite" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("action=followups calls renderFollowups and returns its result", async () => {
    cookieState.user = { id: "user-a" };
    renderFollowupsMock.mockResolvedValue(["q1?", "q2?"]);
    const res = await POST(
      makeReq({ pitch: VALID_PITCH, action: "followups" }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ questions: ["q1?", "q2?"] });
    expect(renderFollowupsMock).toHaveBeenCalledTimes(1);
    expect(renderEnhancedMock).not.toHaveBeenCalled();
  });

  it("action=enhance calls renderEnhanced and returns its result", async () => {
    cookieState.user = { id: "user-a" };
    const polished =
      "We accelerate indie founders by automating MVP boilerplate end to end.";
    renderEnhancedMock.mockResolvedValue(polished);
    const res = await POST(
      makeReq({ pitch: VALID_PITCH, action: "enhance" }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ enhanced: polished });
    expect(renderEnhancedMock).toHaveBeenCalledTimes(1);
    expect(renderFollowupsMock).not.toHaveBeenCalled();
  });

  it("returns 502 when renderFollowups throws", async () => {
    cookieState.user = { id: "user-a" };
    const err = new Error("Anthropic blew up");
    renderFollowupsMock.mockRejectedValue(err);
    const res = await POST(
      makeReq({ pitch: VALID_PITCH, action: "followups" }) as never,
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Coach is unavailable. Try again in a moment.");
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [capturedErr, capturedCtx] = captureExceptionMock.mock.calls[0];
    expect(capturedErr).toBe(err);
    expect(capturedCtx).toMatchObject({
      tags: { route: "pitch-coach", action: "followups" },
    });
  });

  it("returns 502 when renderEnhanced throws", async () => {
    cookieState.user = { id: "user-a" };
    const err = new Error("model timeout");
    renderEnhancedMock.mockRejectedValue(err);
    const res = await POST(
      makeReq({ pitch: VALID_PITCH, action: "enhance" }) as never,
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Coach is unavailable. Try again in a moment.");
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [capturedErr, capturedCtx] = captureExceptionMock.mock.calls[0];
    expect(capturedErr).toBe(err);
    expect(capturedCtx).toMatchObject({
      tags: { route: "pitch-coach", action: "enhance" },
    });
  });

  it("trims pitch before forwarding to the render fn", async () => {
    cookieState.user = { id: "user-a" };
    renderFollowupsMock.mockResolvedValue([]);
    const padded = `   ${VALID_PITCH}   `;
    const res = await POST(
      makeReq({ pitch: padded, action: "followups" }) as never,
    );
    expect(res.status).toBe(200);
    expect(renderFollowupsMock).toHaveBeenCalledTimes(1);
    expect(renderFollowupsMock).toHaveBeenCalledWith(VALID_PITCH);
  });

  it("returns 429 with Retry-After when the per-user rate limit fires", async () => {
    cookieState.user = { id: "user-a" };
    const reset = Date.now() + 5 * 60 * 1000;
    limitCoachCallsMock.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset,
      limit: 20,
    });
    const res = await POST(
      makeReq({ pitch: VALID_PITCH, action: "followups" }) as never,
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Limit")).toBe("20");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    const body = await res.json();
    expect(body.category).toBe("rate-limit");
    expect(body.error).toMatch(/breather|try again/i);
    // The limiter check happens BEFORE body validation and before the
    // Anthropic dispatch, so the render fns should not have been called.
    expect(renderFollowupsMock).not.toHaveBeenCalled();
    expect(renderEnhancedMock).not.toHaveBeenCalled();
  });

  it("rate limit is keyed by userId, not pitch — same user gets one bucket", async () => {
    cookieState.user = { id: "user-a" };
    renderFollowupsMock.mockResolvedValue([]);
    await POST(makeReq({ pitch: VALID_PITCH, action: "followups" }) as never);
    expect(limitCoachCallsMock).toHaveBeenCalledTimes(1);
    expect(limitCoachCallsMock).toHaveBeenCalledWith("user-a");
  });
});
