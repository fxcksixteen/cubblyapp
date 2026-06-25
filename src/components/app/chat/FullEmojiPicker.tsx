import { useMemo, useState } from "react";
import emojiGroups from "@/data/emoji-by-group.json";

/**
 * Full-Unicode emoji picker. Sourced from `unicode-emoji-json` so every
 * standard emoji is reachable (~1800), grouped exactly like Discord with
 * a keyword search across each emoji's name + slug.
 */

type RawGroup = { name: string; slug: string; emojis: { emoji: string; name: string; slug: string }[] };
const GROUPS = emojiGroups as unknown as RawGroup[];

// Friendlier short labels for the tab strip.
const GROUP_LABEL: Record<string, string> = {
  smileys_emotion: "Smileys",
  people_body: "People",
  component: "People",
  animals_nature: "Animals",
  food_drink: "Food",
  travel_places: "Travel",
  activities: "Activities",
  objects: "Objects",
  symbols: "Symbols",
  flags: "Flags",
};

// Flatten + dedupe components into people, drop empty groups.
const CATEGORIES = (() => {
  const merged = new Map<string, { name: string; emojis: { emoji: string; name: string; slug: string }[] }>();
  for (const g of GROUPS) {
    const label = GROUP_LABEL[g.slug] ?? g.name;
    if (!merged.has(label)) merged.set(label, { name: label, emojis: [] });
    merged.get(label)!.emojis.push(...g.emojis);
  }
  return Array.from(merged.values()).filter((c) => c.emojis.length > 0);
})();

const ALL_EMOJIS = CATEGORIES.flatMap((c) => c.emojis);

interface Props {
  onPick: (emoji: string) => void;
}

const FullEmojiPicker = ({ onPick }: Props) => {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState(CATEGORIES[0].name);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return CATEGORIES.find((c) => c.name === activeCat)?.emojis ?? [];
    }
    const out: { emoji: string; name: string; slug: string }[] = [];
    for (const e of ALL_EMOJIS) {
      if (e.name.includes(q) || e.slug.includes(q)) {
        out.push(e);
        if (out.length >= 400) break;
      }
    }
    return out;
  }, [query, activeCat]);

  return (
    <div
      className="w-[340px] rounded-xl border shadow-2xl overflow-hidden"
      style={{ backgroundColor: "#1e1f22", borderColor: "#2b2d31" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-2 pt-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji..."
          className="w-full rounded-md px-3 py-1.5 text-sm outline-none"
          style={{ backgroundColor: "#111214", color: "#dbdee1" }}
        />
      </div>
      <div className="flex gap-0.5 px-2 pt-2 overflow-x-auto scrollbar-thin">
        {CATEGORIES.map((c) => (
          <button
            key={c.name}
            type="button"
            onClick={() => { setQuery(""); setActiveCat(c.name); }}
            className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors"
            style={{
              backgroundColor: activeCat === c.name && !query ? "#404249" : "transparent",
              color: activeCat === c.name && !query ? "#fff" : "#b5bac1",
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-0.5 p-2 max-h-[280px] overflow-y-auto">
        {list.map((e, i) => (
          <button
            key={`${e.emoji}-${i}`}
            type="button"
            title={e.name}
            onClick={() => onPick(e.emoji)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-xl transition-transform hover:scale-125 hover:bg-white/10"
          >
            {e.emoji}
          </button>
        ))}
        {list.length === 0 && (
          <div className="col-span-8 py-6 text-center text-xs" style={{ color: "#949ba4" }}>
            No emoji matches "{query}"
          </div>
        )}
      </div>
    </div>
  );
};

export default FullEmojiPicker;
