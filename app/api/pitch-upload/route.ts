import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Image upload + Supabase Storage round-trip stays well under 10s for
// 5MB files on a normal connection. Pro plan default page timeout is
// fine here.
export const maxDuration = 15;

const BUCKET = "pitch-images";
// 5 MB — matches the bucket-level file_size_limit in migration 015.
const MAX_BYTES = 5 * 1024 * 1024;
// Mirror of the bucket's allowed_mime_types so the route can fail
// fast with a useful error before reaching Storage.
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
// Map MIME → file extension. Used for the storage key only; the
// MIME type itself is the content-type we send to Supabase.
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

// POST /api/pitch-upload
//
// Accepts a single image file as multipart/form-data under the field
// name `file`. Authenticated users only (the pitch coach pattern —
// auth gate sidesteps drive-by abuse). Uploads to the public
// pitch-images bucket at `users/<auth-user-id>/<random-hex>.<ext>`,
// returns the public URL.
//
// The 3-image-per-pitch cap is enforced at the UI + at submitSchema
// validation; this route doesn't know about pitches, only files.
export async function POST(req: NextRequest) {
  // ─── auth ────────────────────────────────────────────────
  let userId: string | null = null;
  try {
    const cookieClient = createCookieClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    /* fall through to 401 */
  }
  if (!userId) {
    return NextResponse.json(
      {
        error: "Sign in to upload an image.",
        category: "auth",
        redirect_to: `/login?next=${encodeURIComponent("/?resume=1")}`,
      },
      { status: 401 },
    );
  }

  // ─── parse + validate ────────────────────────────────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Could not parse upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing `file` field." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `Image too large. Max ${MAX_BYTES / 1024 / 1024}MB.`,
        category: "size",
      },
      { status: 413 },
    );
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      {
        error: "Unsupported image type. Use JPEG, PNG, WebP, or AVIF.",
        category: "type",
      },
      { status: 415 },
    );
  }

  // ─── upload ─────────────────────────────────────────────
  // Server-side admin client because the cookie client can't write to
  // storage with the user's JWT alone (storage RLS expects the path
  // to start with `users/<auth.uid()>/...` — which a service-role
  // upload satisfies indirectly via the path we construct here).
  const ext = EXT[file.type] ?? "bin";
  const key = `users/${userId}/${randomBytes(16).toString("hex")}.${ext}`;
  const admin = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(key, buffer, {
      contentType: file.type,
      cacheControl: "31536000, immutable", // 1y cache; key includes a random suffix
      upsert: false,
    });

  if (uploadErr) {
    console.error("[pitch-upload] storage upload failed", uploadErr);
    Sentry.captureException(uploadErr, {
      tags: { route: "pitch-upload", phase: "storage-upload" },
      extra: { userId, key, fileType: file.type, fileSize: file.size },
    });
    return NextResponse.json(
      { error: "Could not save image. Try again." },
      { status: 500 },
    );
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(key);

  return NextResponse.json({ url: pub.publicUrl, key });
}
