"use client";

import { useEffect, useRef } from "react";

// Minimal React wrapper around the Cloudflare Turnstile invisible widget.
//
// Usage pattern (controller — preferred for our cinematic submit form):
//
//   const ref = useRef<TurnstileHandle>(null);
//   <Turnstile ref={ref} onVerify={(token) => {...}} />
//   ...
//   await ref.current?.execute(); // returns a Promise<string>
//
// The widget renders as a 0×0 invisible element. It triggers a challenge
// only when execute() is called or when Cloudflare deems the session
// suspicious. Most legitimate users see nothing.
//
// When NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, the component is a no-op
// (renders nothing, execute() resolves with empty string). Lets dev/preview
// builds without a Cloudflare account keep working.

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        opts: {
          sitekey: string;
          size?: "normal" | "compact" | "invisible" | "flexible";
          callback?: (token: string) => void;
          // Cloudflare passes an error code string to error-callback
          // (e.g. "100xxx" init/domain, "200xxx" network). Surface it
          // so we can tell domain-allowlist issues from network blocks.
          "error-callback"?: (errorCode?: string) => void;
          "expired-callback"?: () => void;
          "before-interactive-callback"?: () => void;
          appearance?: "always" | "execute" | "interaction-only";
          execution?: "render" | "execute";
          theme?: "light" | "dark" | "auto";
        },
      ) => string | undefined;
      execute: (widgetId: string) => void;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit";

// How long to wait for the invisible widget to register before we give up.
// Cloudflare's script normally loads + renders in well under a second; 5s
// is enough headroom for slow networks without leaving the user staring.
const READY_TIMEOUT_MS = 5000;

export type TurnstileHandle = {
  execute: () => Promise<string>;
  reset: () => void;
  enabled: boolean;
};

// Diagnostic message helper — translates raw Cloudflare error codes (or
// our own readiness errors) into something the user can act on.
function diagnoseError(code: string | undefined): string {
  if (!code) return "Captcha verification failed. Refresh and try again.";
  if (code.startsWith("100") || code.startsWith("110")) {
    // 100xxx = init / domain not allowed; 110xxx = invalid params
    return "Captcha is misconfigured for this site. Try again in a moment.";
  }
  if (code.startsWith("200")) {
    return "Captcha couldn't reach Cloudflare — check your connection or ad blocker.";
  }
  if (code.startsWith("300") || code.startsWith("600")) {
    return "Captcha challenge failed. Try again.";
  }
  return `Captcha verification failed (${code}). Refresh and try again.`;
}

export function Turnstile({
  onVerify,
  onError,
  handleRef,
}: {
  onVerify?: (token: string) => void;
  onError?: () => void;
  handleRef?: React.MutableRefObject<TurnstileHandle | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // The current execute() promise resolver. Re-armed each call.
  const pendingResolveRef = useRef<((token: string) => void) | null>(null);
  const pendingRejectRef = useRef<((err: Error) => void) | null>(null);
  // Resolves once the widget has been rendered and has a usable widget id.
  // execute() awaits this before calling window.turnstile.execute().
  const readyPromiseRef = useRef<Promise<void> | null>(null);
  const readyResolveRef = useRef<(() => void) | null>(null);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const enabled = !!siteKey;

  // Initialize the readiness promise once per component lifecycle. Has to
  // happen synchronously in render so execute() can grab it before the
  // first render-phase effect lands.
  if (enabled && !readyPromiseRef.current) {
    readyPromiseRef.current = new Promise<void>((resolve) => {
      readyResolveRef.current = resolve;
    });
  }

  useEffect(() => {
    // Always populate the imperative handle, even when disabled — call sites
    // shouldn't have to branch on whether Turnstile is configured.
    if (handleRef) {
      handleRef.current = {
        enabled,
        execute: async () => {
          if (!enabled) return "";
          // Wait for the widget to register, with a hard ceiling so the
          // form doesn't hang forever if the script never loaded
          // (ad blocker, CSP, network policy).
          if (readyPromiseRef.current) {
            const timeout = new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      "Captcha didn't load in time — disable ad blockers or refresh the page.",
                    ),
                  ),
                READY_TIMEOUT_MS,
              ),
            );
            await Promise.race([readyPromiseRef.current, timeout]);
          }
          if (!widgetIdRef.current || !window.turnstile) {
            throw new Error(
              "Captcha didn't initialize — disable ad blockers or refresh the page.",
            );
          }
          return new Promise<string>((resolve, reject) => {
            pendingResolveRef.current = resolve;
            pendingRejectRef.current = reject;
            window.turnstile!.execute(widgetIdRef.current!);
          });
        },
        reset: () => {
          if (!enabled || !widgetIdRef.current || !window.turnstile) return;
          window.turnstile.reset(widgetIdRef.current);
        },
      };
    }
  }, [handleRef, enabled]);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || !window.turnstile || !containerRef.current) return;
      if (widgetIdRef.current) return; // already rendered
      const id = window.turnstile.render(containerRef.current, {
        sitekey: siteKey!,
        size: "invisible",
        execution: "execute",
        appearance: "interaction-only",
        callback: (token: string) => {
          onVerify?.(token);
          pendingResolveRef.current?.(token);
          pendingResolveRef.current = null;
          pendingRejectRef.current = null;
        },
        "error-callback": (errorCode?: string) => {
          // Surface Cloudflare's error code in browser console so prod
          // failures can be diagnosed without backend access.
          console.warn("[turnstile] error-callback", errorCode);
          onError?.();
          pendingRejectRef.current?.(new Error(diagnoseError(errorCode)));
          pendingResolveRef.current = null;
          pendingRejectRef.current = null;
        },
        "expired-callback": () => {
          // Token expired before we used it — the next execute() will mint
          // a fresh one, no further action needed here.
        },
      });
      if (id) {
        widgetIdRef.current = id;
        readyResolveRef.current?.();
        readyResolveRef.current = null;
      }
    };

    // Inject the script once per page-load. The `onloadTurnstileCallback`
    // global is what Cloudflare's loader calls when the SDK is ready.
    if (window.turnstile) {
      renderWidget();
    } else {
      window.onloadTurnstileCallback = renderWidget;
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src*="turnstile/v0/api.js"]`,
      );
      if (!existing) {
        const s = document.createElement("script");
        s.src = SCRIPT_SRC;
        s.async = true;
        s.defer = true;
        // If the script itself fails to load (CSP, network block,
        // ad blocker), the readiness promise stays pending and execute()
        // hits the timeout path — but we also log here so a quick
        // browser-console glance reveals the cause.
        s.onerror = () => {
          console.warn(
            "[turnstile] script load failed — challenges.cloudflare.com may be blocked",
          );
        };
        document.head.appendChild(s);
      }
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget already gone */
        }
        widgetIdRef.current = null;
      }
    };
  }, [enabled, siteKey, onVerify, onError]);

  if (!enabled) return null;
  return <div ref={containerRef} aria-hidden style={{ display: "none" }} />;
}
