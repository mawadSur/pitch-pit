"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import * as Sentry from "@sentry/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import {
  Paperclip,
  Mic,
  MicOff,
  Loader2,
  X,
  AlertTriangle,
} from "lucide-react";

const MAX_IMAGES = 3;
const ACCEPTED_MIME = "image/jpeg,image/png,image/webp,image/avif";

// Web Speech API typings — TS doesn't ship these globally.
type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = { 0: SpeechRecognitionAlternative; isFinal: boolean };
type SpeechRecognitionResultList = ArrayLike<SpeechRecognitionResult>;
type SpeechRecognitionEvent = { resultIndex: number; results: SpeechRecognitionResultList };

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (e: SpeechRecognitionEvent) => void;
  onerror: (e: { error: string }) => void;
  onend: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognition;
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export type Attachment = {
  url: string;
  // The local-blob preview while uploading, then the public URL when done.
  previewUrl: string;
  // For aborting an in-flight upload + cleaning up the object URL.
  blobUrl: string;
  uploading: boolean;
  error?: string;
};

// PitchAttachments — sits beside the input shell on the homepage.
// Provides:
//   • paperclip → file picker (3 max, JPG/PNG/WebP/AVIF, 5MB each)
//     uploads via /api/pitch-upload, shows a thumbnail strip with X
//     to remove. Removed images are NOT deleted from Supabase Storage —
//     they orphan, but the row never references them so they're
//     unreachable via the app. (A future cleanup job can sweep.)
//   • mic → Web Speech API, appends transcribed text to the pitch.
//     Hidden when the API isn't available (Firefox, older Safari).
export function PitchAttachments({
  attachments,
  onAttachmentsChange,
  onAppendText,
  disabled = false,
}: {
  attachments: Attachment[];
  onAttachmentsChange: (next: Attachment[]) => void;
  onAppendText: (text: string) => void;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  // Buffer for the current voice session. Committed to onAppendText
  // when recording stops, so the user sees the transcript appended
  // once at the end rather than character-by-character (which would
  // fight the textarea's own state).
  const sessionBufferRef = useRef("");

  // Detect Web Speech API availability on mount only (avoids SSR/hydration
  // mismatch).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setVoiceSupported(
      typeof (window.SpeechRecognition ?? window.webkitSpeechRecognition) ===
        "function",
    );
  }, []);

  // Clean up object URLs on unmount so the browser frees the blob memory.
  useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.blobUrl) {
          try {
            URL.revokeObjectURL(a.blobUrl);
          } catch {
            /* already revoked */
          }
        }
      });
    };
    // attachments intentionally not in deps — we only run cleanup on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remaining = MAX_IMAGES - attachments.length;
  const canAddMore = remaining > 0 && !disabled;

  function openPicker() {
    if (!canAddMore) return;
    fileInputRef.current?.click();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // reset so picking the same file again still fires
    if (!files.length) return;
    // Trim to remaining slots — silently drops extras rather than
    // erroring. The picker honors `multiple` so someone CAN pick 4 with
    // 1 slot left; we just take the first 1.
    const accepted = files.slice(0, remaining);

    // Add placeholder entries with blob previews IMMEDIATELY so the UI
    // updates before the network round-trip completes.
    const drafts: Attachment[] = accepted.map((file) => {
      const blobUrl = URL.createObjectURL(file);
      return {
        url: "",
        previewUrl: blobUrl,
        blobUrl,
        uploading: true,
      };
    });
    const next = [...attachments, ...drafts];
    onAttachmentsChange(next);

    // Upload each file sequentially. Sequential keeps the order stable
    // and avoids parallel-upload weirdness if the user is on a flaky
    // connection. 3 files max so there's no perf incentive to parallelize.
    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i];
      const draftIdx = next.length - accepted.length + i;
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/pitch-upload", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
            redirect_to?: string;
          };
          throw new Error(err.error ?? "Upload failed.");
        }
        const data = (await res.json()) as { url: string };
        // Replace the draft with the real URL. Keep the blobUrl as the
        // local preview source — switching to the remote URL would
        // cause a fresh network fetch + flicker.
        const updated: Attachment = {
          url: data.url,
          previewUrl: drafts[i].blobUrl,
          blobUrl: drafts[i].blobUrl,
          uploading: false,
        };
        // Read the latest attachments state via a callback so we don't
        // overwrite changes that happened during upload (e.g. user
        // removed an earlier image).
        onAttachmentsChange(
          replaceByBlobUrl(next, drafts[i].blobUrl, updated, draftIdx),
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : "Upload failed.";
        // Per-file capture so we see flaky uploads in Sentry rather than
        // them silently turning into a red AlertTriangle on the thumbnail.
        Sentry.captureException(e, {
          tags: { surface: "pitch-attachments", phase: "upload" },
          extra: { fileName: file.name, fileSize: file.size, fileType: file.type },
        });
        onAttachmentsChange(
          replaceByBlobUrl(
            next,
            drafts[i].blobUrl,
            {
              ...drafts[i],
              uploading: false,
              error: message,
            },
            draftIdx,
          ),
        );
      }
    }
  }

  function remove(blobUrl: string) {
    const next = attachments.filter((a) => a.blobUrl !== blobUrl);
    onAttachmentsChange(next);
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {
      /* already revoked */
    }
  }

  function startRecording() {
    if (!voiceSupported || disabled) return;
    setVoiceError(null);
    sessionBufferRef.current = "";
    const Ctor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false; // commit only on final results
    rec.lang = "en-US";
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          sessionBufferRef.current += `${r[0].transcript.trim()} `;
        }
      }
    };
    rec.onerror = (e) => {
      // "no-speech" + "aborted" are normal when the user stops or
      // pauses — don't surface as errors.
      if (e.error === "no-speech" || e.error === "aborted") return;
      setVoiceError(
        e.error === "not-allowed"
          ? "Microphone access denied."
          : `Voice error: ${e.error}`,
      );
    };
    rec.onend = () => {
      const transcript = sessionBufferRef.current.trim();
      if (transcript) onAppendText(transcript);
      setRecording(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = rec;
    setRecording(true);
    rec.start();
  }

  function stopRecording() {
    recognitionRef.current?.stop();
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Action row — paperclip + mic. Compact icons, ≥44pt touch
          targets, sit to the right of the textarea on the homepage's
          input shell. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openPicker}
          disabled={!canAddMore}
          aria-label={`Attach an image (${attachments.length} of ${MAX_IMAGES})`}
          title={`Attach an image — ${remaining} slot${remaining === 1 ? "" : "s"} left`}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/70 transition-colors hover:border-[var(--scene-gold)]/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
        </button>
        {voiceSupported && (
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={disabled}
            aria-label={recording ? "Stop voice input" : "Start voice input"}
            aria-pressed={recording}
            title={recording ? "Tap to stop" : "Tap to dictate your pitch"}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)] disabled:cursor-not-allowed disabled:opacity-40 ${
              recording
                ? "border-[var(--scene-oxblood-bright)]/60 bg-[var(--scene-oxblood-bright)]/15 text-[var(--scene-oxblood-bright)] motion-safe:animate-pulse"
                : "border-white/15 bg-white/[0.04] text-white/70 hover:border-[var(--scene-gold)]/55 hover:text-white"
            }`}
          >
            {recording ? (
              <MicOff className="h-4 w-4" aria-hidden />
            ) : (
              <Mic className="h-4 w-4" aria-hidden />
            )}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MIME}
          multiple
          onChange={onFileSelected}
          className="sr-only"
          aria-hidden
        />
      </div>

      {/* Voice error caption — sits below the action row when the user
          denied mic access or hit a different error. Auto-clears on
          the next start. */}
      {voiceError && (
        <p
          role="alert"
          className="scene-mono text-[0.55rem] uppercase tracking-[0.16em] text-red-300/85"
        >
          {voiceError}
        </p>
      )}

      {/* Thumbnail strip — only when there are attachments. Animates
          per-row via popLayout so removal feels physical. */}
      <AnimatePresence initial={false}>
        {attachments.length > 0 && (
          <motion.ul
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-wrap gap-2"
            aria-label="Attached images"
          >
            {attachments.map((a) => (
              <motion.li
                key={a.blobUrl}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="relative h-16 w-16 overflow-hidden rounded-xl border border-white/15 bg-white/[0.04]"
              >
                <Image
                  src={a.previewUrl}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                  unoptimized
                />
                {a.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
                    <Loader2
                      className="h-4 w-4 animate-spin text-[var(--scene-gold)]"
                      aria-label="Uploading"
                    />
                  </div>
                )}
                {a.error && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--scene-oxblood)]/65 backdrop-blur-sm">
                    <AlertTriangle
                      className="h-4 w-4 text-white"
                      aria-label={a.error}
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => remove(a.blobUrl)}
                  aria-label="Remove image"
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/30 bg-black/85 text-white/85 transition-colors hover:border-[var(--scene-oxblood-bright)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// Replace the entry in `list` whose blobUrl matches, with `next`. Used
// after upload completion or failure to keep the list order stable
// even if state has been mutated mid-flight.
function replaceByBlobUrl(
  list: Attachment[],
  blobUrl: string,
  next: Attachment,
  hintIndex: number,
): Attachment[] {
  const idx =
    list[hintIndex]?.blobUrl === blobUrl
      ? hintIndex
      : list.findIndex((a) => a.blobUrl === blobUrl);
  if (idx < 0) return list;
  return [...list.slice(0, idx), next, ...list.slice(idx + 1)];
}
