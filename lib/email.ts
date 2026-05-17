import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { Resend } from "resend";
import { buildClaudeCodePrompt, type BuildPromptIdea } from "@/lib/build-prompt";

// Lazy-initialized transport — created on first send.
let _transport: ReturnType<typeof nodemailer.createTransport> | null = null;

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !user || !pass || !from) {
    console.warn(
      "[email] Missing SMTP env vars (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM). " +
        "Build notification will not be sent.",
    );
    return null;
  }

  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    user,
    pass,
    from,
  };
}

function getTransport(config: SmtpConfig) {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
  }
  return _transport;
}

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(opts: MailOptions): Promise<void> {
  const config = getSmtpConfig();
  if (!config) return;

  const transport = getTransport(config);
  const message: Mail.Options = {
    from: config.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  };

  await transport.sendMail(message);
}

// ────────────────────────────────────────────────────────────────────
// Resend-backed transactional + marketing email path.
//
// Used by the subscribe + digest crons (step 5 of the May 2026 roadmap).
// We deliberately keep the nodemailer/SMTP path above untouched —
// sendBuildNotification() already targets the operator inbox and SMTP
// is what they configured. Resend is the right primitive for
// double-opt-in confirmations + bulk digest fan-out (DKIM signing,
// reputation pool, batch.send for 100x throughput).
// ────────────────────────────────────────────────────────────────────

let _resend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(
      "[email] RESEND_API_KEY is unset — Resend send skipped (subscribe + digest crons no-op).",
    );
    return null;
  }
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

function getEmailFrom(): string | null {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.warn("[email] EMAIL_FROM is unset — Resend send skipped.");
    return null;
  }
  return from;
}

export interface ResendMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Single-recipient send. Returns true on success, false on configuration
// gap (env vars unset) or hard failure. Errors are logged but never
// thrown so callers — particularly the subscribe POST — can never leak
// whether the address already exists by failure shape.
export async function sendResendEmail(msg: ResendMessage): Promise<boolean> {
  const client = getResend();
  const from = getEmailFrom();
  if (!client || !from) return false;
  try {
    const { error } = await client.emails.send({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    if (error) {
      console.error("[email] Resend single-send failed", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Resend send threw", err);
    return false;
  }
}

// Bulk send via Resend's batch endpoint. Splits into chunks of 100
// (Resend's documented limit) and dispatches sequentially. Returns a
// per-chunk count of successes + a list of error messages so the cron
// can surface partial failures without 500ing the whole job.
export interface BatchResult {
  attempted: number;
  succeeded: number;
  errors: string[];
}

const BATCH_SIZE = 100;

export async function sendResendBatch(
  messages: ResendMessage[],
): Promise<BatchResult> {
  const result: BatchResult = {
    attempted: messages.length,
    succeeded: 0,
    errors: [],
  };
  if (messages.length === 0) return result;

  const client = getResend();
  const from = getEmailFrom();
  if (!client || !from) {
    result.errors.push("resend-not-configured");
    return result;
  }

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE).map((m) => ({
      from,
      to: m.to,
      subject: m.subject,
      html: m.html,
      text: m.text,
    }));
    try {
      const { data, error } = await client.batch.send(chunk);
      if (error) {
        result.errors.push(
          `chunk ${i / BATCH_SIZE}: ${error.message ?? "unknown error"}`,
        );
        continue;
      }
      // Resend returns `{ data: { id }[] }` on success — count entries.
      const sent = Array.isArray(data?.data) ? data.data.length : chunk.length;
      result.succeeded += sent;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`chunk ${i / BATCH_SIZE}: ${msg}`);
    }
  }
  return result;
}

export async function sendBuildNotification(idea: BuildPromptIdea): Promise<void> {
  const to =
    process.env.NOTIFY_EMAIL ??
    (process.env.NODE_ENV === "production" ? undefined : "mawad10101@gmail.com");

  if (!to) {
    console.warn("[email] NOTIFY_EMAIL not set. Skipping build notification.");
    return;
  }

  const body = buildClaudeCodePrompt(idea);
  await sendMail({
    to,
    subject: `[pitch-pit] Build greenlit: ${idea.title}`,
    text: body,
  });
}
