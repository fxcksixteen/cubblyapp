import { AggregatedReaction } from "@/hooks/useMessageReactions";

interface Props {
  reactions: AggregatedReaction[];
  onToggle: (emoji: string) => void;
}

/**
 * Pill row of emoji reactions shown beneath a chat message. Mirrors Discord:
 * users who already reacted highlight their pill blue, tapping toggles.
 */
const MessageReactionsBar = ({ reactions, onToggle }: Props) => {
  if (!reactions.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(r.emoji);
          }}
          className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors"
          style={{
            backgroundColor: r.reactedByMe
              ? "rgba(88,101,242,0.15)"
              : "rgba(255,255,255,0.04)",
            borderColor: r.reactedByMe ? "#5865f2" : "transparent",
            color: r.reactedByMe ? "#dee0ff" : "var(--app-text-secondary, #b5bac1)",
          }}
        >
          <span className="text-sm leading-none">{r.emoji}</span>
          <span className="font-semibold tabular-nums">{r.count}</span>
        </button>
      ))}
    </div>
  );
};

export default MessageReactionsBar;
