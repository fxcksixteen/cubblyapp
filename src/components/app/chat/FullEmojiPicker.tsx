import { useMemo, useState } from "react";

/**
 * A lightweight, no-dependency emoji picker for message reactions.
 * Grouped into a handful of categories with a search field.
 *
 * Curated for size — covers the most-used reaction emojis without bloating
 * the bundle the way emoji-mart would.
 */

const CATEGORIES: { name: string; emojis: string[] }[] = [
  {
    name: "Smileys",
    emojis: "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🥱 🥲 🥹 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 😶‍🌫️ 🫠 🫡 🫢 🫣 🫤 🫥".split(" "),
  },
  {
    name: "Gestures",
    emojis: "👍 👎 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👋 🤚 🖐️ ✋ 🖖 👏 🙌 🫶 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦿 🦵 🦶 👂 🦻 👃 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄 🫦".split(" "),
  },
  {
    name: "Hearts",
    emojis: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💔 ❤️‍🔥 ❤️‍🩹".split(" "),
  },
  {
    name: "Animals",
    emojis: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🦟 🦗 🕷️".split(" "),
  },
  {
    name: "Food",
    emojis: "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🍞 🥖 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🫔 🥙 🧆 🥘 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕ 🍵 🧃 🥤 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🍾 🧉".split(" "),
  },
  {
    name: "Activities",
    emojis: "⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🥊 🥋 🥅 ⛳ ⛸️ 🎣 🤿 🎽 🛹 🛼 🛷 ⛷️ 🏂 🪂 🏋️ 🤼 🤸 🏌️ 🏇 🧘 🏄 🏊 🚴 🚵 🎮 🎲 🧩 🎯 🎳 🎰 🃏 🀄 🎴".split(" "),
  },
  {
    name: "Objects",
    emojis: "💯 🔥 ⭐ 🌟 ✨ ⚡ 💥 💫 ☀️ 🌈 ☁️ ❄️ ☔ 💧 💦 🌊 🎉 🎊 🎁 🎈 🎀 🪩 💎 👑 🏆 🥇 🥈 🥉 🎖️ 🏅 🎗️ 🎫 🎟️ 💰 💵 💸 💳 💼 📱 💻 🖥️ ⌨️ 🖱️ 🎧 🎤 🎵 🎶 🎼 📚 📖 ✏️ 📝 ✂️ 🔒 🔑 🛒".split(" "),
  },
  {
    name: "Symbols",
    emojis: "✅ ❌ ❗ ❓ ‼️ ⁉️ 💢 ♨️ ⛔ 🚫 🆗 🆒 🆕 🆓 ▶️ ⏸️ ⏹️ ⏺️ ⏭️ ⏮️ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↔️ ↕️ 🔀 🔁 🔂 🔄 🔃 ♻️ ⚜️ 🔱 ☢️ ☣️ ⚠️ 🚸".split(" "),
  },
];

const ALL_EMOJIS = CATEGORIES.flatMap((c) => c.emojis);

interface Props {
  onPick: (emoji: string) => void;
}

const FullEmojiPicker = ({ onPick }: Props) => {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState(CATEGORIES[0].name);

  const list = useMemo(() => {
    if (!query.trim()) {
      return CATEGORIES.find((c) => c.name === activeCat)?.emojis ?? [];
    }
    // No emoji name index — fall back to "all", trimmed.
    return ALL_EMOJIS;
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
      <div
        className="grid grid-cols-8 gap-0.5 p-2 max-h-[280px] overflow-y-auto"
      >
        {list.map((e, i) => (
          <button
            key={`${e}-${i}`}
            type="button"
            onClick={() => onPick(e)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-xl transition-transform hover:scale-125 hover:bg-white/10"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
};

export default FullEmojiPicker;
