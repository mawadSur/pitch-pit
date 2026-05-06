import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import sharp from "sharp";
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
    const cookieClient = await createCookieClient();
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

  // ─── re-encode + strip metadata ──────────────────────────
  // Phone photos carry EXIF including GPS — a screenshot of a
  // living-room whiteboard would silently leak the founder's home
  // location. sharp drops all metadata by default (no withMetadata()
  // call), and re-encoding through it scrubs anything embedded.
  // We also resize to a 2400x2400 box (fit:inside, no upscale) which
  // covers all our render targets and dramatically cuts file size on
  // 4000+ wide phone uploads. Format is preserved 1:1 so the existing
  // MIME / extension contract stays intact.
  const inputBuffer = Buffer.from(await file.arrayBuffer());
  let processed: Buffer;
  try {
    const pipeline = sharp(inputBuffer, { failOn: "error" })
      .rotate() // honor EXIF orientation before we strip it
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true });
    switch (file.type) {
      case "image/jpeg":
        processed = await pipeline.jpeg({ quality: 85 }).toBuffer();
        break;
      case "image/png":
        // PNG is lossless; sharp's default compressionLevel is fine.
        processed = await pipeline.png().toBuffer();
        break;
      case "image/webp":
        processed = await pipeline.webp({ quality: 85 }).toBuffer();
        break;
      case "image/avif":
        processed = await pipeline.avif({ quality: 85 }).toBuffer();
        break;
      default:
        // ALLOWED gate above means this is unreachable, but keep the
        // type system happy and fail closed if someone widens ALLOWED
        // without updating this switch.
        return NextResponse.json(
          { error: "Unsupported image type.", category: "type" },
          { status: 415 },
        );
    }
  } catch (err) {
    console.error("[pitch-upload] sharp re-encode failed", err);
    Sentry.captureException(err, {
      tags: { route: "pitch-upload", phase: "sharp-reencode" },
      extra: { userId, fileType: file.type, fileSize: file.size },
    });
    return NextResponse.json(
      {
        error: "Could not process image. Try a different file.",
        category: "decode",
      },
      { status: 400 },
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

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(key, processed, {
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
