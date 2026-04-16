import { useState } from "react";
import ImageLightbox from "@/components/app/ImageLightbox";

interface InlineGifProps {
  url: string;
}

/**
 * Renders a chat-message GIF with a "GIF" badge on hover and click-to-zoom
 * via the shared ImageLightbox.
 */
const InlineGif = ({ url }: InlineGifProps) => {
  const [open, setOpen] = useState(false);
  return (
    <>
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
      {open && <ImageLightbox url={url} name="gif" onClose={() => setOpen(false)} />}
    </>
  );
};

export default InlineGif;
