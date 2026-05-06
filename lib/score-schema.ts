import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

// Lock image_urls to URLs served by the project's pitch-images bucket.
// `NEXT_PUBLIC_SUPABASE_URL` is exposed to both client + server, so the
// schema is consistent across both runtimes. If unset (e.g. a preview
// build with missing env), fall through and accept any valid URL — but
// loudly warn so ops sees it. The defense-in-depth check exists to
// reject direct API hits with hostile URLs; UI uploads always come back
// from /api/pitch-upload with the expected prefix.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Strip any trailing slashes so the prefix is exactly one slash before
// the bucket path, regardless of whether the env var has one or not.
const EXPECTED_IMAGE_PREFIX = supabaseUrl
  ? `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/pitch-images/`
  : null;

if (!EXPECTED_IMAGE_PREFIX) {
  Sentry.captureMessage(
    "[score-schema] NEXT_PUBLIC_SUPABASE_URL not set; image_urls host check disabled",
    "warning",
  );
}

const imageUrlSchema = z
  .string()
  .url()
  .refine(
    (url) =>
      EXPECTED_IMAGE_PREFIX === null || url.startsWith(EXPECTED_IMAGE_PREFIX),
    { message: "image_urls must come from the pitch-images bucket" },
  );

export const submitSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "A tribute must have a name.")
    .max(80, "Names exceeding 80 characters offend the Capitol."),
  pitch: z
    .string()
    .trim()
    .min(60, "Be more specific — at least 60 characters.")
    .max(3500, "Keep it under 3500 characters."),
  handle: z
    .string()
    .trim()
    .max(50, "A founder's mark must not exceed 50 characters.")
    .optional()
    .or(z.literal("")),
  // Cloudflare Turnstile token — empty string accepted client-side when
  // the widget isn't configured. Server enforces presence only when the
  // secret key is set (see lib/turnstile.ts).
  turnstile_token: z.string().optional().default(""),
  // Idempotency key — client-supplied UUID v4. Same uuid + same user (or
  // same anon IP) within 5 minutes returns the existing draft instead of
  // minting a new one. Optional for backwards compat: requests without
  // request_id skip the dedupe path entirely.
  request_id: z.string().uuid().optional(),
  // Up to 3 public Supabase Storage URLs for images attached to the
  // pitch. Each URL must point at the project's pitch-images bucket;
  // we validate that on the server before persisting. Empty array
  // when no attachments — the default keeps existing callers working.
  image_urls: z
    .array(imageUrlSchema)
    .max(3, "Maximum 3 images per pitch.")
    .default([]),
});

export type SubmitInput = z.infer<typeof submitSchema>;

export const scoreSchema = z.object({
  score: z.number().int().min(1).max(10),
  verdict: z.string().min(1),
  strengths: z.array(z.string().min(1)).min(1).max(6),
  concerns: z.array(z.string().min(1)).min(1).max(6),
  reasoning: z.string().min(1),
  build_recommended: z.boolean(),
  moderation_flag: z.boolean().default(false),
  moderation_reason: z.string().default(""),
});

export type ScoreResult = z.infer<typeof scoreSchema>;

export const SUBMIT_LIMITS = {
  titleMax: 80,
  pitchMin: 60,
  pitchMax: 3500,
  handleMax: 50,
} as const;
