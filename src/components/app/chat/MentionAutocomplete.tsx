import { useEffect, useMemo, useRef, useState } from "react";
import { getProfileColor } from "@/lib/profileColors";

export interface MentionCandidate {
  userId: string;
  name: string;
  avatarUrl?: string | null;
}

interface MentionAutocompleteProps {
  /** Current textarea value. */
  value: string;
  /** Caret position in the textarea (0-based). */
  caret: number;
  /** All possible mention targets (recent typers / channel members / DM peer). */
  candidates: MentionCandidate[];
  /** Called when the user picks a mention; receives the new full value + new caret. */
  onPick: (nextValue: string, nextCaret: number) => void;
  /** Forwarded keydown so Tab / Enter / arrows can drive selection. */
  onKeyHandled: () => void;
  /** Anchor element (textarea) — popup positions itself just above it. */
  anchorEl: HTMLTextAreaElement | null;
}

/**
 * Discord-style "@mention" picker. Detects an unfinished `@token` immediately
 * before the caret (no whitespace inside it), filters candidates by prefix,
 * and renders a popup directly above the textarea. Imperative API: parent
 * triggers `handleKeyDown(e)` via the returned handle to intercept Enter / Tab
 * / Arrow keys before send.
 */
export function useMentionAutocomplete({
  value,
  caret,
  candidates,
}: {
  value: string;
  caret: number;
  candidates: MentionCandidate[];
}) {
  const match = useMemo(() => {
    if (caret <= 0) return null;
    const before = value.slice(0, caret);
    // Find the last "@" not preceded by a word char (so emails don't trigger).
    const m = before.match(/(?:^|[\s\n])@([\w.-]{0,32})$/);
    if (!m) return null;
    const token = m[1] ?? "";
    const start = caret - token.length - 1; // include the "@"
    return { token, start };
  }, [value, caret]);

  const filtered = useMemo(() => {
    if (!match) return [];
    const q = match.token.toLowerCase();
    const seen = new Set<string>();
    const out: MentionCandidate[] = [];
    for (const c of candidates) {
      if (seen.has(c.userId)) continue;
      if (!q || c.name.toLowerCase().includes(q)) {
        seen.add(c.userId);
        out.push(c);
      }
      if (out.length >= 10) break;
    }
    return out;
  }, [candidates, match]);

  return { match, filtered };
}

interface MentionPopupProps {
  filtered: MentionCandidate[];
  activeIndex: number;
  onSelect: (c: MentionCandidate) => void;
  setActiveIndex: (i: number) => void;
}

/** Visual popup. Render only when `filtered.length > 0`. */
export const MentionPopup = ({ filtered, activeIndex, onSelect, setActiveIndex }: MentionPopupProps) => {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 max-h-[260px] overflow-y-auto rounded-lg border shadow-2xl"
      style={{
        backgroundColor: "var(--app-bg-tertiary, #111214)",
        borderColor: "var(--app-border, #2b2d31)",
        zIndex: 60,
      }}
    >
      <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted, #6d6f78)" }}>
        Members matching @
      </p>
      {filtered.map((c, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={c.userId}
            data-idx={i}
            onMouseDown={(e) => { e.preventDefault(); onSelect(c); }}
            onMouseEnter={() => setActiveIndex(i)}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors"
            style={{
              backgroundColor: active ? "var(--app-hover, #2e3035)" : "transparent",
              color: "var(--app-text-primary, #dbdee1)",
            }}
          >
            {c.avatarUrl ? (
              <img src={c.avatarUrl} alt={c.name} className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: getAvatarColor(c.userId) }}
              >
                {c.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="truncate">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
};
