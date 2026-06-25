import { useState } from "react";
import ImageLightbox from "@/components/app/ImageLightbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Copy, Download, ExternalLink, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

interface InlineGifProps {
  url: string;
}

/**
 * Renders a chat-message GIF with a "GIF" badge on hover and click-to-zoom
 * via the shared ImageLightbox. Right-click opens an image-style context
 * menu (copy link, copy image, save, open in new tab).
 */
const InlineGif = ({ url }: InlineGifProps) => {
  const [open, setOpen] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("GIF link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleCopyImage = async () => {
    try {
      const res = await fetch(url, { mode: "cors" });
      const blob = await res.blob();
      // Most browsers only allow image/png via clipboard.write; convert via canvas.
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = URL.createObjectURL(blob);
      await new Promise((r) => (img.onload = () => r(null)));
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      const pngBlob: Blob = await new Promise((res2) => canvas.toBlob((b) => res2(b!), "image/png"));
      await (navigator.clipboard as any).write([new ClipboardItem({ "image/png": pngBlob })]);
      toast.success("GIF copied");
    } catch {
      toast.error("Couldn't copy the GIF — copying the link instead");
      handleCopyLink();
    }
  };

  const handleSave = async () => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `gif-${Date.now()}.gif`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      toast.error("Failed to save GIF");
    }
  };

  const handleOpen = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative mt-1 block max-w-fit cursor-zoom-in group/gif"
          >
            <img
              src={url}
              alt="GIF"
              className="max-h-[200px] rounded-lg group-hover/gif:brightness-90 transition-[filter]"
              loading="lazy"
            />
            <span
              className="pointer-events-none absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 group-hover/gif:opacity-100 transition-opacity"
              style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
            >
              GIF
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-56 rounded-xl border p-1.5 shadow-xl"
          style={{ backgroundColor: "#111214", borderColor: "#2b2d31" }}
        >
          <ContextMenuItem
            onClick={handleCopyImage}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
          >
            <Copy className="h-4 w-4" />
            Copy GIF
          </ContextMenuItem>
          <ContextMenuItem
            onClick={handleCopyLink}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
          >
            <LinkIcon className="h-4 w-4" />
            Copy Link
          </ContextMenuItem>
          <ContextMenuSeparator className="my-1 bg-[#2b2d31]" />
          <ContextMenuItem
            onClick={handleSave}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Save GIF
          </ContextMenuItem>
          <ContextMenuItem
            onClick={handleOpen}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
          >
            <ExternalLink className="h-4 w-4" />
            Open in New Tab
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {open && <ImageLightbox url={url} name="gif" onClose={() => setOpen(false)} />}
    </>
  );
};

export default InlineGif;
