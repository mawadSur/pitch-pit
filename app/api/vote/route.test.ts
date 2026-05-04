// Integration tests for POST /api/vote.
//
// Toggle behavior: insert if no existing vote, delete if one exists. Owner
// pre-check returns 403 to short-circuit before hitting RLS. We mock at
// the Supabase module boundary and dispatch on table name.

import { describe, it, expect, vi, beforeEach } from "vitest";

type State = {
  user?: { id: string } | null;
  idea?: { user_id: string | null } | null;
  existingVote?: { id: string } | null;
  insertError?: { message: string };
  deleteError?: { message: string };
};

let state: State = {};
let lastInsert: { user_id: string; idea_id: string } | null = null;
let lastDelete: { id: string } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user ?? null } }),
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
          select: () => {
            // Two callers: (1) toggle-check via .eq.eq.maybeSingle,
            // (2) GET count via {count: "exact", head: true}.eq → returns
            // a thenable {count, error}. We support both.
            const builder: Record<string, unknown> = {
              eq: () => builder,
              maybeSingle: async () => ({
                data: state.existingVote ?? null,
                error: null,
              }),
            };
            // Make it await-able as a count query too.
            (builder as { then: unknown }).then = (
              resolve: (v: unknown) => unknown,
            ) =>
              resolve({
                count: 0,
                error: null,
              });
            return builder;
          },
          insert: (row: { user_id: string; idea_id: string }) => {
            lastInsert = row;
            return Promise.resolve({
              error: state.insertError ?? null,
            });
          },
          delete: () => ({
            eq: (_col: string, val: string) => {
              lastDelete = { id: val };
              return Promise.resolve({
                error: state.deleteError ?? null,
              });
            },
          }),
        };
      }
      return {};
    },
  }),
}));

import { POST } from "./route";

function makeReq(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

const IDEA_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("POST /api/vote", () => {
  beforeEach(() => {
    state = {};
    lastInsert = null;
    lastDelete = null;
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
    state.existingVote = null;
    const res = await POST(makeReq({ ideaId: IDEA_ID }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voted).toBe(true);
    expect(lastInsert).toEqual({ user_id: "user-a", idea_id: IDEA_ID });
    expect(lastDelete).toBeNull();
  });

  it("retracts an existing vote (toggle off)", async () => {
    state.user = { id: "user-a" };
    state.idea = { user_id: "user-b" };
    state.existingVote = { id: "vote-1" };
    const res = await POST(makeReq({ ideaId: IDEA_ID }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voted).toBe(false);
    expect(lastDelete).toEqual({ id: "vote-1" });
    expect(lastInsert).toBeNull();
  });
});
