// Unit tests for lib/email.ts.
//
// The module wraps nodemailer with a lazy-singleton transport and
// gates everything behind 4 env vars (SMTP_HOST/USER/PASS/FROM). We
// mock nodemailer at the module boundary so no real connection is
// attempted, and we use vi.resetModules() between tests so the
// internal `_transport` singleton doesn't leak state across cases.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SentMessage = {
  from: unknown;
  to: unknown;
  subject: unknown;
  text: unknown;
};

const sendMailMock = vi.fn<(msg: SentMessage) => Promise<unknown>>();
const createTransportMock = vi.fn();

vi.mock("nodemailer", () => ({
  default: {
    createTransport: (...args: unknown[]) => {
      createTransportMock(...args);
      return { sendMail: sendMailMock };
    },
  },
}));

const SMTP_ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "NOTIFY_EMAIL",
  "NEXT_PUBLIC_SITE_URL",
] as const;
const savedEnv: Partial<Record<(typeof SMTP_ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of SMTP_ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  sendMailMock.mockReset();
  sendMailMock.mockResolvedValue({ messageId: "msg-1" });
  createTransportMock.mockReset();
  vi.resetModules();
});

afterEach(() => {
  for (const k of SMTP_ENV_KEYS) {
    if (savedEnv[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = savedEnv[k];
    }
  }
});

describe("sendMail", () => {
  it("no-ops (and warns) when any required SMTP env var is missing", async () => {
    // All four required vars unset → returns without sending and without
    // constructing the transport.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mod = await import("./email");
    await mod.sendMail({ to: "x@example.com", subject: "s", text: "t" });
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("constructs the transport once and sends the message when all vars present", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.SMTP_FROM = "from@example.com";
    // Custom port → secure=false.
    process.env.SMTP_PORT = "2525";

    const mod = await import("./email");
    await mod.sendMail({
      to: "to@example.com",
      subject: "Hi",
      text: "Hello.",
    });

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    const [transportConfig] = createTransportMock.mock.calls[0];
    expect(transportConfig).toMatchObject({
      host: "smtp.example.com",
      port: 2525,
      secure: false,
      auth: { user: "user", pass: "pass" },
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith({
      from: "from@example.com",
      to: "to@example.com",
      subject: "Hi",
      text: "Hello.",
    });
  });

  it("treats port 465 as TLS (secure=true)", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.SMTP_FROM = "from@example.com";
    process.env.SMTP_PORT = "465";

    const mod = await import("./email");
    await mod.sendMail({ to: "a", subject: "b", text: "c" });
    const [transportConfig] = createTransportMock.mock.calls[0];
    expect(transportConfig).toMatchObject({ port: 465, secure: true });
  });

  it("defaults port to 587 when SMTP_PORT is unset", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.SMTP_FROM = "from@example.com";

    const mod = await import("./email");
    await mod.sendMail({ to: "a", subject: "b", text: "c" });
    const [transportConfig] = createTransportMock.mock.calls[0];
    expect(transportConfig).toMatchObject({ port: 587, secure: false });
  });

  it("reuses the transport across multiple sendMail calls (lazy singleton)", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.SMTP_FROM = "from@example.com";

    const mod = await import("./email");
    await mod.sendMail({ to: "a", subject: "1", text: "x" });
    await mod.sendMail({ to: "b", subject: "2", text: "y" });
    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
  });
});

describe("sendBuildNotification", () => {
  const idea = {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Test Idea",
    pitch: "Build a better mousetrap. People love mice.",
    score: 8,
    final_score: 80,
    verdict: "Sharp wedge.",
    strengths: ["Clear demand"],
    concerns: ["Distribution thin"],
    reasoning: "Has legs.",
  };

  it("uses NOTIFY_EMAIL when set", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.SMTP_FROM = "from@example.com";
    process.env.NOTIFY_EMAIL = "ops@example.com";

    const mod = await import("./email");
    await mod.sendBuildNotification(idea);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.to).toBe("ops@example.com");
    expect(msg.subject).toContain("Build greenlit");
    expect(msg.subject).toContain(idea.title);
    expect(String(msg.text)).toContain(idea.title);
    expect(String(msg.text)).toContain(idea.pitch);
  });

  it("falls back to default dev email when NOTIFY_EMAIL unset and not production", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.SMTP_FROM = "from@example.com";
    // NODE_ENV is "test" in vitest; the fallback applies.

    const mod = await import("./email");
    await mod.sendBuildNotification(idea);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0].to).toBe("mawad10101@gmail.com");
  });

  it("no-ops when SMTP env is missing (sendMail returns early)", async () => {
    // SMTP_FROM missing — sendMail returns early before sendBuildNotification's
    // transport is ever touched.
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.NOTIFY_EMAIL = "ops@example.com";

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mod = await import("./email");
    await mod.sendBuildNotification(idea);
    expect(sendMailMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("propagates sendMail rejection (caller decides retry)", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.SMTP_FROM = "from@example.com";
    process.env.NOTIFY_EMAIL = "ops@example.com";
    sendMailMock.mockRejectedValueOnce(new Error("550 mailbox full"));

    const mod = await import("./email");
    await expect(mod.sendBuildNotification(idea)).rejects.toThrow(
      /mailbox full/,
    );
  });
});
