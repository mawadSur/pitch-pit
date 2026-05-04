// Integration tests for POST /api/claim-idea.
//
// Mocks the Supabase clients at the module boundary so we can exercise the
// route handler's branching without touching a real database. Covers:
//   - 401 when no user session
//   - 404 when idea doesn't exist
//   - 403 when idea is owned by someone else
//   - 200 + alreadyClaimed when the user already owns it
//   - 200 happy claim
//   - 409 race condition when someone else claims between read and update

import { describe, it, expect, vi, beforeEach } from "vitest";

// Test doubles for the Supabase clients. We rebuild these per-test so each
// test gets a clean state. See `installMocks` below.
type AdminMock = {
  fetchIdea?: { id: string; user_id: string | null } | null;
  fetchError?: { message: string };
  updateResult?: { id: string } | null;
  updateError?: { message: string };
};
type CookieMock = {
  user?: { id: string } | null;
};

let adminState: AdminMock = {};
let cookieState: CookieMock = {};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: adminState.fetchIdea ?? null,
            error: adminState.fetchError ?? null,
          }),
        }),
      }),
      update: () => ({
        eq: () => ({
          is: () => ({
            select: () => ({
              maybeSingle: async () => ({
                data: adminState.updateResult ?? null,
                error: adminState.updateError ?? null,
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: cookieState.user ?? null },
      }),
    },
  }),
}));

// Import AFTER the mocks are declared.
import { POST } from "./route";

// Minimal stand-in for NextRequest. We only call `req.json()` in the route,
// so a stub with that one method is enough — `new Request(...)` with a body
// string doesn't round-trip through `.json()` cleanly in vitest's Node
// environment.
function makeReq(body: unknown): Request {
  return {
    json: async () => body,
  } as unknown as Request;
}

describe("POST /api/claim-idea", () => {
  beforeEach(() => {
    adminState = {};
    cookieState = {};
  });

  it("returns 401 when not signed in", async () => {
    cookieState.user = null;
    const res = await POST(
      makeReq({ ideaId: "550e8400-e29b-41d4-a716-446655440000" }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed body", async () => {
    cookieState.user = { id: "user-a" };
    const res = await POST(
      makeReq({ notIdeaId: "x" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when idea doesn't exist", async () => {
    cookieState.user = { id: "user-a" };
    adminState.fetchIdea = null;
    const res = await POST(
      makeReq({ ideaId: "550e8400-e29b-41d4-a716-446655440000" }) as never,
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when idea is owned by someone else", async () => {
    cookieState.user = { id: "user-a" };
    adminState.fetchIdea = {
      id: "idea-1",
      user_id: "user-b",
    };
    const res = await POST(
      makeReq({ ideaId: "550e8400-e29b-41d4-a716-446655440000" }) as never,
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 alreadyClaimed when the user already owns it", async () => {
    cookieState.user = { id: "user-a" };
    adminState.fetchIdea = { id: "idea-1", user_id: "user-a" };
    const res = await POST(
      makeReq({ ideaId: "550e8400-e29b-41d4-a716-446655440000" }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyClaimed).toBe(true);
  });

  it("happy path: claims an unclaimed idea", async () => {
    cookieState.user = { id: "user-a" };
    adminState.fetchIdea = { id: "idea-1", user_id: null };
    adminState.updateResult = { id: "idea-1" }; // update matched 1 row
    const res = await POST(
      makeReq({ ideaId: "550e8400-e29b-41d4-a716-446655440000" }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("race: 409 when someone else claims between read and update", async () => {
    cookieState.user = { id: "user-a" };
    // Read sees user_id IS NULL...
    adminState.fetchIdea = { id: "idea-1", user_id: null };
    // ...but the conditional UPDATE matches zero rows because someone
    // else's transaction won the race.
    adminState.updateResult = null;
    const res = await POST(
      makeReq({ ideaId: "550e8400-e29b-41d4-a716-446655440000" }) as never,
    );
    expect(res.status).toBe(409);
  });
});
