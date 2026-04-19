import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import folderFileIcon from "@/assets/icons/folder-file.svg";
import ImageLightbox from "@/components/app/ImageLightbox";
import VideoLightbox from "@/components/app/VideoLightbox";
import { Maximize2 } from "lucide-react";

interface Attachment {
  name: string;
  /** Stable bucket path (preferred — new messages). */
  path?: string;
  /** Legacy: a short-lived signed URL persisted in old messages. */
  url?: string;
  size: number;
  type: string;
}

interface AttachmentItemProps {
  attachment: Attachment;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Extracts the storage object path from any flavor of Supabase storage URL
 * pointing at our private `chat-attachments` bucket. Used to recover a stable
 * path from old messages that only stored a (now-expired) signed URL.
 */
function extractStoragePath(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/chat-attachments\/(.+)$/);
    if (m) return decodeURIComponent(m[1]);
    return null;
  } catch {
    return null;
  }
}

/**
 * Renders an attachment from the private `chat-attachments` bucket.
 *
 * CRITICAL: we never mount `<img>` / `<video>` / `<a>` with a stale URL.
 * The component first resolves a fresh signed URL (from `attachment.path` if
 * present, else extracted from a legacy `attachment.url`) and only then
 * renders the media element. This prevents the 400-Bad-Request spam from old
 * messages whose signed URL has long since expired.
 */
const AttachmentItem = ({ attachment }: AttachmentItemProps) => {
  const [url, setUrl] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [videoLightboxOpen, setVideoLightboxOpen] = useState(false);

  const isImage = attachment.type.startsWith("image/");
  const isVideo =
    attachment.type.startsWith("video/") ||
    /\.(mp4|mov|webm|m4v|mkv)$/i.test(attachment.name);

  useEffect(() => {
    let cancelled = false;
    const path =
      attachment.path ||
      (attachment.url ? extractStoragePath(attachment.url) : null);

    if (!path) {
      // Not a private-bucket URL — use the URL as-is (handles external links).
      if (attachment.url) setUrl(attachment.url);
      return;
    }

    setUrl(null);
    setErrored(false);
    supabase.storage
      .from("chat-attachments")
      .createSignedUrl(path, 60 * 60 * 24)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (data?.signedUrl) {
          setUrl(data.signedUrl);
        } else {
          console.warn("[Attachment] failed to sign URL:", error?.message);
          setErrored(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.path, attachment.url]);

  // Skeleton while we wait for the fresh signed URL — never render <img> with a stale URL.
  if (!url && !errored) {
    return (
      <div
        className="mt-1 flex items-center gap-2 rounded-lg border p-3 max-w-sm animate-pulse"
        style={{
          borderColor: "var(--app-border, #1e1f22)",
          backgroundColor: "var(--app-bg-secondary, #2b2d31)",
        }}
      >
        <img src={folderFileIcon} alt="" className="h-8 w-8 invert opacity-30 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="h-3 w-32 rounded bg-white/10 mb-1" />
          <div className="h-2 w-16 rounded bg-white/5" />
        </div>
      </div>
    );
  }

  if (isImage && url && !errored) {
    return (
      <>
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="block mt-1 max-w-sm cursor-zoom-in"
        >
          <img
            src={url}
            alt={attachment.name}
            className="max-h-[400px] max-w-full rounded-lg object-contain hover:brightness-90 transition-[filter]"
            onError={() => setErrored(true)}
            loading="lazy"
          />
        </button>
        {lightboxOpen && (
          <ImageLightbox url={url} name={attachment.name} onClose={() => setLightboxOpen(false)} />
        )}
      </>
    );
  }

  if (isVideo && url && !errored) {
    return (
      <>
        <div className="group relative mt-1 max-w-sm overflow-hidden rounded-lg bg-black">
          <video
            src={url}
            controls
            preload="metadata"
            playsInline
            className="max-h-[360px] max-w-full rounded-lg"
            onError={() => setErrored(true)}
          />
          <button
            type="button"
            onClick={() => setVideoLightboxOpen(true)}
            className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-opacity"
            title="Fullscreen"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {videoLightboxOpen && (
          <VideoLightbox url={url} name={attachment.name} onClose={() => setVideoLightboxOpen(false)} />
        )}
      </>
    );
  }

  // File (or errored media falls back to a download tile)
  return (
    <a
      href={url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 flex items-center gap-2 rounded-lg border p-3 max-w-sm transition-colors"
      style={{
        borderColor: "var(--app-border, #1e1f22)",
        backgroundColor: "var(--app-bg-secondary, #2b2d31)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-hover, #32353b)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--app-bg-secondary, #2b2d31)")}
    >
      <img src={folderFileIcon} alt="" className="h-8 w-8 invert opacity-60 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#00a8fc] truncate">{attachment.name}</p>
        <p className="text-[11px]" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
          {formatFileSize(attachment.size)}
          {errored ? " · failed to load" : ""}
        </p>
      </div>
    </a>
  );
};

export default AttachmentItem;
