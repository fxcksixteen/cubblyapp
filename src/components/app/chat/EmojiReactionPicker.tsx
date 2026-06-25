import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus } from "lucide-react";
import emojiReactIcon from "@/assets/icons/emoji-react.svg";
import { QUICK_REACTIONS } from "@/hooks/useMessageReactions";
import FullEmojiPicker from "./FullEmojiPicker";

interface Props {
  onPick: (emoji: string) => void;
  size?: "sm" | "md";
}

/**
 * Small emoji slider used by the message hover toolbar / context menu.
 * Renders the 6 quick emojis horizontally with a "+" on the far right that
 * opens the full emoji picker so any emoji can be used as a reaction.
 */
const EmojiReactionPicker = ({ onPick, size = "sm" }: Props) => {
  const btnSize = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={`flex ${btnSize} items-center justify-center rounded-md transition-colors hover:bg-white/10`}
          title="Add Reaction"
        >
          <img src={emojiReactIcon} alt="React" className="h-4 w-4 invert opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={6}
        className="w-auto rounded-xl border p-1.5 shadow-xl"
        style={{ backgroundColor: "#111214", borderColor: "#2b2d31" }}
      >
        <div className="flex items-center gap-1">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                onPick(e);
                setOpen(false);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-transform hover:scale-125 hover:bg-white/10"
            >
              {e}
            </button>
          ))}
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(ev) => ev.stopPropagation()}
                className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-[#b5bac1] transition-colors hover:bg-white/10 hover:text-white"
                title="More emojis"
              >
                <Plus className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" sideOffset={6} className="p-0 border-0 bg-transparent shadow-none">
              <FullEmojiPicker onPick={(e) => { onPick(e); setMoreOpen(false); setOpen(false); }} />
            </PopoverContent>
          </Popover>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default EmojiReactionPicker;

