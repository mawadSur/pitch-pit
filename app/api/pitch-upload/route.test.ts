// Integration tests for POST /api/pitch-upload.
//
// Mocks both Supabase clients + sharp at the module boundary so we can:
//   - exercise the auth gate (401)
//   - reject oversize / wrong-MIME files (413 / 415)
//   - exercise the sharp re-encode pipeline + the upload step
//   - confirm the Storage call gets a unique-key path scoped to the user
//   - cover the upload-failure 500 path

import { beforeEach, describe, expect, it, vi } from "vitest";

type CookieMock = { user?: { id: string } | null };

let cookieState: CookieMock = {};

type StorageUploadResult = { error: { message: string } | null };
let storageUploadResult: StorageUploadResult = { error: null };
let lastStorageUpload: {
  bucket: string;
  key: string;
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
} | null = null;
let lastPublicUrlKey: string | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: cookieState.user ?? null } }),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: async (
          key: string,
          _buf: Buffer,
          opts: {
            contentType?: string;
            cacheControl?: string;
            upsert?: boolean;
          },
        ) => {
          lastStorageUpload = { bucket, key, ...opts };
          return storageUploadResult;
        },
        getPublicUrl: (key: string) => {
          lastPublicUrlKey = key;
          return {
            data: { publicUrl: `https://cdn.example/${bucket}/${key}` },
          };
        },
      }),
    },
  }),
}));

// sharp stub. The route awaits a chained .rotate().resize().{jpeg|png|webp|avif}().toBuffer()
// — we return a small Buffer per format call. We expose the recorded MIME so
// tests can assert the chain selected the right encoder.
let lastSharpEncoder: "jpeg" | "png" | "webp" | "avif" | null = null;
let sharpShouldThrow = false;

vi.mock("sharp", () => ({
  default: (_buf: Buffer, _opts: unknown) => {
    function encoderFactory(name: typeof lastSharpEncoder) {
      return () => {
        lastSharpEncoder = name;
        if (sharpShouldThrow) {
          return {
            toBuffer: async () => {
              throw new Error("decode failed");
            },
          };
        }
        return { toBuffer: async () => Buffer.from(`fake-${name}`) };
      };
    }
    const chain = {
      rotate: () => chain,
      resize: () => chain,
      jpeg: encoderFactory("jpeg"),
      png: encoderFactory("png"),
      webp: encoderFactory("webp"),
      avif: encoderFactory("avif"),
    };
    return chain;
  },
}));

// Stub Sentry so the route's captureException doesn't try to ship.
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { POST } from "./route";

// Build a request whose .formData() returns the prepared FormData.
function makeReqWithForm(form: FormData | null | "bad"): Request {
  return {
    formData: async () => {
      if (form === "bad") throw new TypeError("not multipart");
      return form;
    },
  } as unknown as Request;
}

function makeFile(
  bytes: number,
  type: string,
  name = "upload.bin",
): File {
  const buf = new Uint8Array(bytes);
  // Fill with deterministic bytes — sharp is mocked, so contents don't matter.
  return new File([buf], name, { type });
}

beforeEach(() => {
  cookieState = {};
  storageUploadResult = { error: null };
  lastStorageUpload = null;
  lastPublicUrlKey = null;
  lastSharpEncoder = null;
  sharpShouldThrow = false;
});

describe("POST /api/pitch-upload", () => {
  it("returns 401 when not signed in", async () => {
    cookieState.user = null;
    const form = new FormData();
    form.set("file", makeFile(100, "image/jpeg", "x.jpg"));
    const res = await POST(makeReqWithForm(form) as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.category).toBe("auth");
    expect(json.redirect_to).toContain("/login");
    expect(lastStorageUpload).toBeNull();
  });

  it("returns 400 when formData parse blows up", async () => {
    cookieState.user = { id: "user-a" };
    const res = await POST(makeReqWithForm("bad") as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when `file` field is missing or not a File", async () => {
    cookieState.user = { id: "user-a" };
    const form = new FormData();
    // No "file" set.
    const res1 = await POST(makeReqWithForm(form) as never);
    expect(res1.status).toBe(400);

    // String value under "file" — not a File instance.
    form.set("file", "string-value");
    const res2 = await POST(makeReqWithForm(form) as never);
    expect(res2.status).toBe(400);
  });

  it("returns 413 when file exceeds the 5MB cap", async () => {
    cookieState.user = { id: "user-a" };
    const form = new FormData();
    // 5MB + 1
    form.set("file", makeFile(5 * 1024 * 1024 + 1, "image/jpeg", "big.jpg"));
    const res = await POST(makeReqWithForm(form) as never);
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.category).toBe("size");
    expect(lastStorageUpload).toBeNull();
  });

  it("returns 415 when MIME is unsupported", async () => {
    cookieState.user = { id: "user-a" };
    const form = new FormData();
    form.set("file", makeFile(100, "image/gif", "x.gif"));
    const res = await POST(makeReqWithForm(form) as never);
    expect(res.status).toBe(415);
    const json = await res.json();
    expect(json.category).toBe("type");
    expect(lastStorageUpload).toBeNull();
  });

  it("happy path: re-encodes, uploads to pitch-images bucket under users/<userId>/ and returns the public URL", async () => {
    cookieState.user = { id: "user-a" };
    const form = new FormData();
    form.set("file", makeFile(200, "image/jpeg", "x.jpg"));
    const res = await POST(makeReqWithForm(form) as never);
    expect(res.status).toBe(200);
    const json = await res.json();

    // Sharp used the jpeg encoder for an image/jpeg upload.
    expect(lastSharpEncoder).toBe("jpeg");

    expect(lastStorageUpload).not.toBeNull();
    expect(lastStorageUpload!.bucket).toBe("pitch-images");
    expect(lastStorageUpload!.contentType).toBe("image/jpeg");
    expect(lastStorageUpload!.upsert).toBe(false);
    expect(lastStorageUpload!.cacheControl).toMatch(/immutable/);
    // Path: users/<userId>/<32-hex>.<ext>
    expect(lastStorageUpload!.key).toMatch(
      /^users\/user-a\/[0-9a-f]{32}\.jpg$/,
    );

    // Public URL returned to the client uses the same key.
    expect(lastPublicUrlKey).toBe(lastStorageUpload!.key);
    expect(json.url).toBe(
      `https://cdn.example/pitch-images/${lastStorageUpload!.key}`,
    );
    expect(json.key).toBe(lastStorageUpload!.key);
  });

  it.each([
    ["image/png", "png", "png"],
    ["image/webp", "webp", "webp"],
    ["image/avif", "avif", "avif"],
  ])(
    "picks the right encoder + extension for %s",
    async (mime, encoder, ext) => {
      cookieState.user = { id: "user-a" };
      const form = new FormData();
      form.set("file", makeFile(200, mime, `x.${ext}`));
      const res = await POST(makeReqWithForm(form) as never);
      expect(res.status).toBe(200);
      expect(lastSharpEncoder).toBe(encoder);
      expect(lastStorageUpload!.key).toMatch(
        new RegExp(`^users/user-a/[0-9a-f]{32}\\.${ext}$`),
      );
      expect(lastStorageUpload!.contentType).toBe(mime);
    },
  );

  it("returns 400 with category='decode' when sharp re-encode throws", async () => {
    cookieState.user = { id: "user-a" };
    sharpShouldThrow = true;
    const form = new FormData();
    form.set("file", makeFile(200, "image/jpeg", "broken.jpg"));
    const res = await POST(makeReqWithForm(form) as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.category).toBe("decode");
    expect(lastStorageUpload).toBeNull();
  });

  it("returns 500 when Supabase Storage upload fails", async () => {
    cookieState.user = { id: "user-a" };
    storageUploadResult = { error: { message: "storage full" } };
    const form = new FormData();
    form.set("file", makeFile(200, "image/jpeg", "x.jpg"));
    const res = await POST(makeReqWithForm(form) as never);
    expect(res.status).toBe(500);
  });
});
