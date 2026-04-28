import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import emojiReactIcon from "@/assets/icons/emoji-react.svg";
import { QUICK_REACTIONS } from "@/hooks/useMessageReactions";

interface Props {
  onPick: (emoji: string) => void;
  size?: "sm" | "md";
}

/**
 * Small emoji slider used by the message hover toolbar / context menu.
 * Renders 6 quick emojis horizontally.
 */
const EmojiReactionPicker = ({ onPick, size = "sm" }: Props) => {
  const btnSize = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  return (
    <Popover>
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
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-transform hover:scale-125 hover:bg-white/10"
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default EmojiReactionPicker;
