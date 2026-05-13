// Unit tests for verifyTurnstile.
//
// verifyTurnstile() is a thin wrapper around Cloudflare's siteverify
// endpoint with a "no secret → bypass" escape hatch for local dev. The
// `turnstileEnabled` flag is evaluated at module-load time, so we have
// to `vi.resetModules()` between the disabled-mode and enabled-mode
// suites and re-import for each. The bare `fetch` is stubbed via
// `globalThis.fetch` so we don't need a separate module mock.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Saving + restoring the secret so tests are hermetic regardless of
// what's in the runner's environment.
const originalSecret = process.env.TURNSTILE_SECRET_KEY;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.TURNSTILE_SECRET_KEY;
  } else {
    process.env.TURNSTILE_SECRET_KEY = originalSecret;
  }
  globalThis.fetch = originalFetch;
  vi.resetModules();
});

describe("verifyTurnstile — disabled (no secret)", () => {
  beforeEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
    vi.resetModules();
  });

  it("returns { ok: true } without calling fetch when secret is unset", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const mod = await import("./turnstile");
    expect(mod.turnstileEnabled).toBe(false);
    const verdict = await mod.verifyTurnstile("anything", "1.2.3.4");
    expect(verdict).toEqual({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("verifyTurnstile — enabled (secret set)", () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret-shh";
    vi.resetModules();
  });

  it("returns failure when token is empty/missing and never calls fetch", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const mod = await import("./turnstile");
    expect(mod.turnstileEnabled).toBe(true);
    const missing = await mod.verifyTurnstile(undefined);
    expect(missing.ok).toBe(false);
    expect(missing.reason).toMatch(/missing/i);

    const empty = await mod.verifyTurnstile("");
    expect(empty.ok).toBe(false);

    const nul = await mod.verifyTurnstile(null);
    expect(nul.ok).toBe(false);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("happy path: posts form-encoded payload, returns ok on success", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const mod = await import("./turnstile");
    const verdict = await mod.verifyTurnstile("real-token", "10.0.0.1");
    expect(verdict).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(VERIFY_URL);
    expect(init.method).toBe("POST");
    expect(
      (init.headers as Record<string, string>)["Content-Type"],
    ).toBe("application/x-www-form-urlencoded");
    // The body is a URLSearchParams instance; the route does
    // body.set("remoteip", ip) only when ip is provided.
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe("test-secret-shh");
    expect(body.get("response")).toBe("real-token");
    expect(body.get("remoteip")).toBe("10.0.0.1");
  });

  it("omits remoteip when caller passes undefined", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const mod = await import("./turnstile");
    await mod.verifyTurnstile("real-token");
    const init = fetchSpy.mock.calls[0][1];
    const body = init.body as URLSearchParams;
    expect(body.has("remoteip")).toBe(false);
  });

  it("returns failure with error-codes when Cloudflare says success:false", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          "error-codes": ["invalid-input-response"],
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const mod = await import("./turnstile");
    const verdict = await mod.verifyTurnstile("stale-token");
    expect(verdict.ok).toBe(false);
    expect(verdict.errorCodes).toEqual(["invalid-input-response"]);
    expect(verdict.reason).toMatch(/captcha verification failed/i);
  });

  it("fails closed when fetch throws (network error / timeout)", async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValue(new Error("network down"));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const mod = await import("./turnstile");
    const verdict = await mod.verifyTurnstile("token");
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/unavailable/i);
  });

  it("fails closed when Cloudflare returns non-2xx", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response("oops", { status: 503 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const mod = await import("./turnstile");
    const verdict = await mod.verifyTurnstile("token");
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/error/i);
  });
});
