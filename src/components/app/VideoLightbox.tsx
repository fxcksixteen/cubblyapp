import { useEffect } from "react";
import { X, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface VideoLightboxProps {
  url: string;
  name?: string;
  onClose: () => void;
}

const VideoLightbox = ({ url, name, onClose }: VideoLightboxProps) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleSave = async () => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name || `video-${Date.now()}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.success("Video saved");
    } catch {
      toast.error("Failed to save video");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in"
      style={{ backgroundColor: "rgba(0,0,0,0.9)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); handleSave(); }}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          title="Save video"
        >
          <Download className="h-5 w-5 text-white" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); window.open(url, "_blank", "noopener,noreferrer"); }}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          title="Open in new tab"
        >
          <ExternalLink className="h-5 w-5 text-white" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          title="Close (Esc)"
        >
          <X className="h-6 w-6 text-white" />
        </button>
      </div>
      <video
        src={url}
        controls
        autoPlay
        playsInline
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl bg-black"
      />
    </div>
  );
};

export default VideoLightbox;
