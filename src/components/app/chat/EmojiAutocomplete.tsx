import { useMemo } from "react";
import emojiGroups from "@/data/emoji-by-group.json";

/**
 * Discord-style ":shortcode" emoji autocomplete. Detects an unfinished `:tok`
 * (≥2 chars) immediately before the caret and offers matching unicode emojis
 * filtered by slug/name. Sibling of MentionAutocomplete — same API shape so
 * ChatView wires it identically.
 */

type RawGroup = { name: string; slug: string; emojis: { emoji: string; name: string; slug: string }[] };
const ALL_EMOJIS: { emoji: string; name: string; slug: string }[] = (
  emojiGroups as unknown as RawGroup[]
).flatMap((g) => g.emojis);

export interface EmojiCandidate {
  emoji: string;
  name: string;
  slug: string;
}

export function useEmojiAutocomplete({
  value,
  caret,
}: {
  value: string;
  caret: number;
}) {
  const match = useMemo(() => {
    if (caret < 2) return null;
    const before = value.slice(0, caret);
    // Need at least 2 chars after the colon, and the colon must be preceded
    // by whitespace or be at the start (so :// in URLs etc. doesn't trigger).
    const m = before.match(/(?:^|[\s\n])(:([a-z0-9_+\-]{2,32}))$/i);
    if (!m) return null;
    const token = (m[2] ?? "").toLowerCase();
    const start = caret - token.length - 1; // include the ":"
    return { token, start };
  }, [value, caret]);

  const filtered = useMemo(() => {
    if (!match) return [] as EmojiCandidate[];
    const q = match.token.toLowerCase();
    const starts: EmojiCandidate[] = [];
    const contains: EmojiCandidate[] = [];
    for (const e of ALL_EMOJIS) {
      if (e.slug.startsWith(q) || e.name.toLowerCase().startsWith(q)) {
        starts.push(e);
      } else if (e.slug.includes(q) || e.name.toLowerCase().includes(q)) {
        contains.push(e);
      }
      if (starts.length >= 8) break;
    }
    return [...starts, ...contains].slice(0, 8);
  }, [match]);

  return { match, filtered };
}

export function EmojiPopup({
  filtered,
  activeIndex,
  setActiveIndex,
  onSelect,
}: {
  filtered: EmojiCandidate[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onSelect: (e: EmojiCandidate) => void;
}) {
  if (filtered.length === 0) return null;
  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-2 max-h-72 overflow-y-auto rounded-lg p-1 shadow-2xl z-50 animate-fade-in"
      style={{
        backgroundColor: "var(--app-bg-tertiary, #1e1f22)",
        border: "1px solid var(--app-border, #2b2d31)",
      }}
    >
      <div
        className="px-2 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wide"
        style={{ color: "var(--app-text-secondary, #949ba4)" }}
      >
        Emoji matching :{filtered[0]?.slug?.slice(0, 12) || ""}
      </div>
      {filtered.map((c, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={c.slug + i}
            type="button"
            onMouseEnter={() => setActiveIndex(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(c);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors"
            style={{
              backgroundColor: active ? "var(--app-hover, #35373c)" : "transparent",
              color: "var(--app-text-primary, #f2f3f5)",
            }}
          >
            <span className="text-lg leading-none">{c.emoji}</span>
            <span className="truncate text-sm font-medium">:{c.slug}:</span>
          </button>
        );
      })}
    </div>
  );
}
