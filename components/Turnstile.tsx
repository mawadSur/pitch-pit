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
          "error-callback"?: () => void;
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

export type TurnstileHandle = {
  execute: () => Promise<string>;
  reset: () => void;
  enabled: boolean;
};

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

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const enabled = !!siteKey;

  useEffect(() => {
    // Always populate the imperative handle, even when disabled — call sites
    // shouldn't have to branch on whether Turnstile is configured.
    if (handleRef) {
      handleRef.current = {
        enabled,
        execute: async () => {
          if (!enabled) return "";
          if (!widgetIdRef.current || !window.turnstile) {
            throw new Error("Turnstile not ready yet");
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
        "error-callback": () => {
          onError?.();
          pendingRejectRef.current?.(new Error("Turnstile error"));
          pendingResolveRef.current = null;
          pendingRejectRef.current = null;
        },
        "expired-callback": () => {
          // Token expired before we used it — the next execute() will mint
          // a fresh one, no further action needed here.
        },
      });
      if (id) widgetIdRef.current = id;
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
