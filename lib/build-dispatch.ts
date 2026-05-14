// Fires a `repository_dispatch` event at the GitHub builder repo so its
// `auto-build` workflow picks up the winning idea and runs the Claude
// Agent SDK to generate + deploy the MVP. The builder reports progress
// back via POST /api/build-callback.
//
// Why GitHub Actions instead of an inline Vercel function: Claude Agent
// SDK + npm install + Vercel deploy easily runs 5-30+ minutes, well
// past Vercel's 300s function ceiling. A free GitHub-hosted runner has
// 6h budget per job and durable logs.
//
// Required env vars (see .env.local.example):
//   GITHUB_DISPATCH_TOKEN   PAT with `repo` + `workflow` scope on the
//                           builder repo. Fine-grained tokens work as
//                           long as "Contents: read+write" and "Actions:
//                           read+write" are granted on the builder repo.
//   GITHUB_BUILDER_OWNER    e.g. "mawad10101"
//   GITHUB_BUILDER_REPO     e.g. "pitch-pit-builder"
//
// Optional:
//   BUILD_CALLBACK_BASE_URL Override for the public origin the builder
//                           posts back to. Defaults to NEXT_PUBLIC_SITE_URL.

import { titleToSlug } from "@/lib/slug";

export interface DispatchIdea {
  id: string;
  title: string;
  pitch: string;
  score: number;
  final_score: number | null;
  verdict: string;
  strengths: string[] | null;
  concerns: string[] | null;
  reasoning: string | null;
}

export interface DispatchOptions {
  idea: DispatchIdea;
  callbackToken: string;
  attempt: number; // 1 for first try, 2 for the retry
}

interface BuilderConfig {
  token: string;
  owner: string;
  repo: string;
  callbackBaseUrl: string;
}

function getConfig(): BuilderConfig | null {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const owner = process.env.GITHUB_BUILDER_OWNER;
  const repo = process.env.GITHUB_BUILDER_REPO;
  if (!token || !owner || !repo) return null;

  const callbackBaseUrl =
    process.env.BUILD_CALLBACK_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://pitchpit.app";

  return { token, owner, repo, callbackBaseUrl };
}

export function isDispatchConfigured(): boolean {
  return getConfig() !== null;
}

export class DispatchError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "DispatchError";
    this.status = status;
  }
}

// repository_dispatch payloads are capped at 10 fields and ~64KB total —
// well within our budget for an idea record.
export async function dispatchBuild(opts: DispatchOptions): Promise<void> {
  const config = getConfig();
  if (!config) {
    throw new DispatchError("dispatch-not-configured", 503);
  }

  const slug = titleToSlug(opts.idea.title);
  const subdomain = slug ? `mvp-${slug}` : `mvp-${opts.idea.id.slice(0, 8)}`;
  const callbackUrl = `${config.callbackBaseUrl}/api/build-callback`;

  const payload = {
    event_type: "pitch-pit-build",
    client_payload: {
      idea: opts.idea,
      slug,
      subdomain,
      callback_url: callbackUrl,
      callback_token: opts.callbackToken,
      attempt: opts.attempt,
    },
  };

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "pitch-pit",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DispatchError(
      `GitHub dispatch failed: ${res.status} ${body.slice(0, 200)}`,
      res.status,
    );
  }
}

// Generates a 32-char hex token suitable for storing in
// build_queue.callback_token. Uses Web Crypto so it works on Edge and
// Node runtimes alike.
export function mintCallbackToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
