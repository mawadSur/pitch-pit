import { render } from "@react-email/render";
import type { ReactElement } from "react";

// Thin wrapper around @react-email/render so callers don't need to
// import the email library directly and so we control the default
// rendering options in one place. All templates render to inline-styled
// HTML (no <style> blocks, no external stylesheets) — email clients
// strip both. Returns { html, text } so we can supply both Content-Type
// variants to Resend (clients without HTML support fall back to text).
export async function renderEmail(
  template: ReactElement,
): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(template),
    render(template, { plainText: true }),
  ]);
  return { html, text };
}
