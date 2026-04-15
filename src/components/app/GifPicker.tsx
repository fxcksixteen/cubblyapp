import { useState, useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import searchIcon from "@/assets/icons/search.svg";

interface GifPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (gifUrl: string) => void;
}

interface GiphyGif {
  id: string;
  title: string;
  images: {
    fixed_height: { url: string; width: string; height: string };
    fixed_width: { url: string; width: string; height: string };
    original: { url: string };
    preview_gif: { url: string };
  };
}

const CATEGORIES = [
  { name: "Trending", query: "" },
  { name: "Reactions", query: "reactions" },
  { name: "Love", query: "love" },
  { name: "Happy", query: "happy" },
  { name: "Sad", query: "sad" },
  { name: "Celebrate", query: "celebrate" },
  { name: "Cute", query: "cute animals" },
  { name: "Funny", query: "funny" },
];

const GifPicker = ({ isOpen, onClose, onSelect }: GifPickerProps) => {
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Trending");
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  const fetchGifs = useCallback(async (searchQuery: string) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/giphy-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          query: searchQuery,
          type: searchQuery ? "search" : "trending",
          limit: 30,
        }),
      });
      const data = await res.json();
      setGifs(data.data || []);
    } catch (e) {
      console.error("Failed to fetch GIFs:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchGifs("");
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setActiveCategory("Trending");
      setGifs([]);
    }
  }, [isOpen, fetchGifs]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onClose]);

  const handleSearch = (value: string) => {
    setQuery(value);
    setActiveCategory(value ? "" : "Trending");
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchGifs(value), 350);
  };

  const handleCategoryClick = (cat: typeof CATEGORIES[0]) => {
    setActiveCategory(cat.name);
    setQuery("");
    fetchGifs(cat.query);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 mb-2 w-[420px] rounded-xl shadow-2xl border overflow-hidden animate-in fade-in-0 slide-in-from-bottom-2 duration-200 z-50"
      style={{ backgroundColor: "var(--app-bg-secondary, #2b2d31)", borderColor: "var(--app-border, #1e1f22)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--app-border, #1e1f22)" }}>
        <span className="text-sm font-bold" style={{ color: "var(--app-text-primary, #dbdee1)" }}>GIFs</span>
        <button onClick={onClose} className="text-[#949ba4] hover:text-[#dbdee1] transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}>
          <img src={searchIcon} alt="" className="h-4 w-4 invert opacity-40 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search GIFs"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#6d6f78]"
            style={{ color: "var(--app-text-primary, #dbdee1)" }}
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex gap-1 px-3 pb-2 overflow-x-auto scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.name}
            onClick={() => handleCategoryClick(cat)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeCategory === cat.name
                ? "bg-[#5865f2] text-white"
                : "text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]"
            }`}
            style={activeCategory !== cat.name ? { backgroundColor: "var(--app-bg-tertiary, #1e1f22)" } : undefined}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* GIF Grid */}
      <div className="h-[320px] overflow-y-auto px-3 pb-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#5865f2] border-t-transparent" />
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-[#949ba4]">
            No GIFs found
          </div>
        ) : (
          <div className="columns-2 gap-2">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => {
                  onSelect(gif.images.original.url);
                  onClose();
                }}
                className="mb-2 w-full break-inside-avoid rounded-lg overflow-hidden hover:opacity-80 hover:scale-[1.02] transition-all duration-150 cursor-pointer"
              >
                <img
                  src={gif.images.fixed_width.url}
                  alt={gif.title}
                  className="w-full rounded-lg"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Powered by GIPHY */}
      <div className="flex items-center justify-center py-2 border-t" style={{ borderColor: "var(--app-border, #1e1f22)" }}>
        <span className="text-[10px] text-[#949ba4]">Powered by GIPHY</span>
      </div>
    </div>
  );
};

export default GifPicker;
