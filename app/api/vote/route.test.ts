// Integration tests for POST /api/vote.
//
// Toggle behavior is now atomic: an UPSERT with ON CONFLICT DO NOTHING
// returns the newly-inserted row on toggle-ON, or an empty array on
// toggle-OFF (followed by a DELETE). Owner pre-check returns 403 to
// short-circuit before hitting RLS. We mock at the Supabase module
// boundary and dispatch on table name.

import { describe, it, expect, vi, beforeEach } from "vitest";

type State = {
  user?: { id: string } | null;
  idea?: { user_id: string | null } | null;
  // Whether the user already has a vote for this idea. The upsert
  // mock uses this to decide whether to return a row (insert won) or
  // an empty array (conflict elided the insert → toggle-off path).
  existingVote?: boolean;
  upsertError?: { message: string };
  deleteError?: { message: string };
};

let state: State = {};
let lastUpsert: { user_id: string; idea_id: string } | null = null;
let lastDelete: { user_id: string; idea_id: string } | null = null;
let lastRpc: { name: string; args: unknown } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user ?? null } }),
    },
    // Referral attribution RPC (Tactic 1). Records the call so tests can
    // assert it fires only when a valid pp_ref cookie is present.
    rpc: async (name: string, args: unknown) => {
      lastRpc = { name, args };
      return { data: null, error: null };
    },
    from: (table: string) => {
      if (table === "ideas") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: state.idea ?? null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "votes") {
        return {
          // GET count: select("*", { count, head }).eq → thenable {count, error}.
          // Returned only so this same mock still serves the GET handler;
          // POST does not call .select() at the top level anymore.
          select: () => {
            const builder: Record<string, unknown> = {
              eq: () => builder,
              maybeSingle: async () => ({
                data: null,
                error: null,
              }),
            };
            (builder as { then: unknown }).then = (
              resolve: (v: unknown) => unknown,
            ) =>
              resolve({
                count: 0,
                error: null,
              });
            return builder;
          },
          // Atomic toggle path: .upsert(row, opts).select("id") → resolves
          // to { data: inserted[], error }. When a row pre-existed and
          // onConflict elided the insert, Postgres + supabase-js return
          // an empty array (with our ignoreDuplicates: true).
          upsert: (
            row: { user_id: string; idea_id: string },
            _opts: unknown,
          ) => {
            lastUpsert = row;
            return {
              select: (_cols: string) =>
                Promise.resolve({
                  data: state.existingVote
                    ? []
                    : [{ id: "new-vote-id" }],
                  error: state.upsertError ?? null,
                }),
            };
          },
          // Toggle-off: .delete().eq("user_id", ...).eq("idea_id", ...).
          delete: () => {
            const captured: Partial<{ user_id: string; idea_id: string }> = {};
            const builder = {
              eq(col: string, val: string) {
                if (col === "user_id") captured.user_id = val;
                if (col === "idea_id") captured.idea_id = val;
                // After the second .eq, the call awaits.
                if (captured.user_id && captured.idea_id) {
                  lastDelete = {
                    user_id: captured.user_id,
                    idea_id: captured.idea_id,
                  };
                  return Promise.resolve({
                    error: state.deleteError ?? null,
                  });
                }
                return builder;
              },
            };
            return builder;
          },
        };
      }
      return {};
    },
  }),
}));

import { POST } from "./route";

// The route reads the `pp_ref` referral cookie via NextRequest.cookies, so the
// mock request must expose a RequestCookies-shaped `cookies.get`. Pass `ref` to
// simulate a voter who arrived through a shared idea link.
function makeReq(body: unknown, ref?: string): Request {
  return {
    json: async () => body,
    cookies: {
      get: (name: string) =>
        name === "pp_ref" && ref ? { value: ref } : undefined,
    },
  } as unknown as Request;
}

const IDEA_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("POST /api/vote", () => {
  beforeEach(() => {
    state = {};
    lastUpsert = null;
    lastDelete = null;
    lastRpc = null;
  });

  it("returns 401 when not signed in", async () => {
    state.user = null;
    const res = await POST(makeReq({ ideaId: IDEA_ID }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed body", async () => {
    state.user = { id: "user-a" };
    const res = await POST(makeReq({ wrong: "field" }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 404 when idea doesn't exist", async () => {
    state.user = { id: "user-a" };
    state.idea = null;
    const res = await POST(makeReq({ ideaId: IDEA_ID }) as never);
    expect(res.status).toBe(404);
  });

  it("returns 403 when voting for own idea", async () => {
    state.user = { id: "user-a" };
    state.idea = { user_id: "user-a" };
    const res = await POST(makeReq({ ideaId: IDEA_ID }) as never);
    expect(res.status).toBe(403);
  });

  it("inserts a new vote when none exists", async () => {
    state.user = { id: "user-a" };
    state.idea = { user_id: "user-b" };
    state.existingVote = false;
    const res = await POST(makeReq({ ideaId: IDEA_ID }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voted).toBe(true);
    expect(lastUpsert).toEqual({ user_id: "user-a", idea_id: IDEA_ID });
    expect(lastDelete).toBeNull();
    // No referral cookie → attribution RPC must not fire.
    expect(lastRpc).toBeNull();
  });

  it("attributes the referrer when a valid pp_ref cookie is present", async () => {
    state.user = { id: "user-a" };
    state.idea = { user_id: "user-b" };
    state.existingVote = false;
    const REF = "11111111-2222-3333-4444-555555555555";
    const res = await POST(makeReq({ ideaId: IDEA_ID }, REF) as never);
    expect(res.status).toBe(200);
    expect(lastRpc).toEqual({
      name: "attribute_vote_referrer",
      args: { p_idea_id: IDEA_ID, p_ref: REF },
    });
  });

  it("ignores a pp_ref cookie that points at the voted idea (self-referral)", async () => {
    state.user = { id: "user-a" };
    state.idea = { user_id: "user-b" };
    state.existingVote = false;
    const res = await POST(makeReq({ ideaId: IDEA_ID }, IDEA_ID) as never);
    expect(res.status).toBe(200);
    expect(lastRpc).toBeNull();
  });

  it("retracts an existing vote (toggle off)", async () => {
    state.user = { id: "user-a" };
    state.idea = { user_id: "user-b" };
    // ON CONFLICT elides the insert → upsert resolves with empty data,
    // route falls through to DELETE by (user_id, idea_id).
    state.existingVote = true;
    const res = await POST(makeReq({ ideaId: IDEA_ID }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voted).toBe(false);
    expect(lastDelete).toEqual({ user_id: "user-a", idea_id: IDEA_ID });
    // upsert still ran (atomic path) — but it was the conflict branch.
    expect(lastUpsert).toEqual({ user_id: "user-a", idea_id: IDEA_ID });
  });
});
