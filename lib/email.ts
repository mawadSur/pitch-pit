import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
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
