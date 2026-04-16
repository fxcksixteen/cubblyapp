import { useEffect, useState } from "react";
import { X, Download, Copy, Link as LinkIcon, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface ImageLightboxProps {
  url: string;
  name?: string;
  onClose: () => void;
}

const ImageLightbox = ({ url, name, onClose }: ImageLightboxProps) => {
  const [loaded, setLoaded] = useState(false);

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
      a.download = name || `image-${Date.now()}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.success("Image saved");
    } catch {
      toast.error("Failed to save image");
    }
  };

  const handleCopyImage = async () => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      // Convert to PNG if needed (clipboard.write only accepts certain types)
      let toWrite = blob;
      if (blob.type !== "image/png" && blob.type !== "image/jpeg") {
        // Convert via canvas to PNG
        const img = new Image();
        img.crossOrigin = "anonymous";
        toWrite = await new Promise<Blob>((resolve, reject) => {
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(img, 0, 0);
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
          };
          img.onerror = reject;
          img.src = URL.createObjectURL(blob);
        });
      }
      await navigator.clipboard.write([
        new ClipboardItem({ [toWrite.type]: toWrite }),
      ]);
      toast.success("Image copied to clipboard");
    } catch (e) {
      console.error("Copy image failed:", e);
      toast.error("Failed to copy image");
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Image link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleOpenNew = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in"
      style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      {/* Top-right close + actions */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); handleSave(); }}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          title="Save image"
        >
          <Download className="h-5 w-5 text-white" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleOpenNew(); }}
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

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <img
            src={url}
            alt={name || "image"}
            onClick={(e) => e.stopPropagation()}
            onLoad={() => setLoaded(true)}
            className={`max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            draggable={false}
          />
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-52 rounded-xl border p-1.5 shadow-xl"
          style={{ backgroundColor: "#111214", borderColor: "var(--app-border, #2b2d31)" }}
        >
          <ContextMenuItem
            onClick={handleSave}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Save image as…
          </ContextMenuItem>
          <ContextMenuItem
            onClick={handleCopyImage}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
          >
            <Copy className="h-4 w-4" />
            Copy image
          </ContextMenuItem>
          <ContextMenuItem
            onClick={handleCopyLink}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
          >
            <LinkIcon className="h-4 w-4" />
            Copy image link
          </ContextMenuItem>
          <ContextMenuItem
            onClick={handleOpenNew}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
          >
            <ExternalLink className="h-4 w-4" />
            Open in new tab
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
};

export default ImageLightbox;
