// Cloudflare Turnstile server-side verification.
//
// When TURNSTILE_SECRET_KEY is unset (dev / preview without an account),
// verifyTurnstile() returns { ok: true } so submissions still flow. In
// production with a real key, every submission must include a token from
// the client widget.
//
// Setup: cloudflare.com → Turnstile → Add site → managed challenge mode.
// Copy site key (public) + secret key (server only) into env vars.

const VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileVerdict = {
  ok: boolean;
  reason?: string;
  // Cloudflare returns these on failure — useful for debugging in logs.
  errorCodes?: string[];
};

export const turnstileEnabled = !!process.env.TURNSTILE_SECRET_KEY;

/**
 * Verify a Turnstile token submitted by the client widget.
 * Pass the user's IP for stricter validation when available.
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string,
): Promise<TurnstileVerdict> {
  // Bypass entirely when no secret is configured. Safe default for local
  // dev — the env-var gate is the single source of truth for whether
  // captcha is required.
  if (!turnstileEnabled) return { ok: true };

  if (!token || token.length === 0) {
    return { ok: false, reason: "Missing captcha token." };
  }

  // Cloudflare's siteverify accepts form-encoded body.
  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY!,
    response: token,
  });
  if (ip) body.set("remoteip", ip);

  let res: Response;
  try {
    res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      // Tight timeout — captcha verify shouldn't ever take more than ~2s.
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.warn("[turnstile] verify request failed", e);
    // Fail closed on network error — better to occasionally annoy a real
    // user than let bots through during a CF outage.
    return {
      ok: false,
      reason: "Captcha service unavailable. Try again shortly.",
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      reason: "Captcha service returned an error.",
    };
  }

  const data = (await res.json()) as {
    success: boolean;
    "error-codes"?: string[];
  };

  if (data.success) return { ok: true };

  return {
    ok: false,
    reason: "Captcha verification failed. Refresh and try again.",
    errorCodes: data["error-codes"],
  };
}
