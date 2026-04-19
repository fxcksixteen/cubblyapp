import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import folderFileIcon from "@/assets/icons/folder-file.svg";
import ImageLightbox from "@/components/app/ImageLightbox";
import VideoLightbox from "@/components/app/VideoLightbox";
import { Maximize2 } from "lucide-react";

interface Attachment {
  name: string;
  url: string;
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
 * Extracts the storage object path from a (possibly expired) signed URL.
 * Signed URLs look like:
 *   https://<project>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=...
 * or older `/object/public/<bucket>/<path>`.
 * Returns null if it doesn't look like a Supabase storage URL for `chat-attachments`.
 */
function extractStoragePath(url: string): string | null {
  try {
    const u = new URL(url);
    // Match either /storage/v1/object/sign/chat-attachments/<path>
    // or /storage/v1/object/public/chat-attachments/<path>
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/chat-attachments\/(.+)$/);
    if (m) return decodeURIComponent(m[1]);
    return null;
  } catch {
    return null;
  }
}

/**
 * Renders an attachment, automatically refreshing expired signed URLs.
 * `chat-attachments` is a private bucket and signed URLs expire — without this,
 * images sent more than an hour ago would break after a refresh.
 */
const AttachmentItem = ({ attachment }: AttachmentItemProps) => {
  const [url, setUrl] = useState(attachment.url);
  const [errored, setErrored] = useState(false);

  // Re-sign on mount if the URL is from our private bucket
  useEffect(() => {
    let cancelled = false;
    const path = extractStoragePath(attachment.url);
    if (!path) {
      setUrl(attachment.url);
      return;
    }
    // Always re-sign for a fresh 24-hour URL on every mount.
    supabase.storage
      .from("chat-attachments")
      .createSignedUrl(path, 60 * 60 * 24)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (data?.signedUrl) {
          setUrl(data.signedUrl);
          setErrored(false);
        } else if (error) {
          console.warn("[Attachment] failed to re-sign URL:", error.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.url]);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [videoLightboxOpen, setVideoLightboxOpen] = useState(false);
  const isImage = attachment.type.startsWith("image/");
  const isVideo =
    attachment.type.startsWith("video/") ||
    /\.(mp4|mov|webm|m4v|mkv)$/i.test(attachment.name);

  if (isImage) {
    return (
      <>
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="block mt-1 max-w-sm cursor-zoom-in"
        >
          {!errored ? (
            <img
              src={url}
              alt={attachment.name}
              className="max-h-[400px] max-w-full rounded-lg object-contain hover:brightness-90 transition-[filter]"
              onError={() => setErrored(true)}
              loading="lazy"
            />
          ) : (
            <div
              className="flex items-center gap-2 rounded-lg border p-3"
              style={{
                borderColor: "var(--app-border, #1e1f22)",
                backgroundColor: "var(--app-bg-secondary, #2b2d31)",
              }}
            >
              <img src={folderFileIcon} alt="" className="h-8 w-8 invert opacity-60 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#00a8fc] truncate">{attachment.name}</p>
                <p className="text-[11px]" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
                  {formatFileSize(attachment.size)}
                </p>
              </div>
            </div>
          )}
        </button>
        {lightboxOpen && (
          <ImageLightbox url={url} name={attachment.name} onClose={() => setLightboxOpen(false)} />
        )}
      </>
    );
  }

  if (isVideo) {
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

  return (
    <a
      href={url}
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
        </p>
      </div>
    </a>
  );
};

export default AttachmentItem;
