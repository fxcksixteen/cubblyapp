import { useState, useEffect, useRef, useCallback } from "react";
import { X, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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

interface GifFavorite {
  id: string;
  gif_id: string;
  gif_url: string;
  gif_preview_url: string;
  title: string;
}

const CATEGORIES = [
  { name: "Favorites", query: "__favorites__" },
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
  const { user } = useAuth();
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Trending");
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<GifFavorite[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  const fetchFavorites = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("gif_favorites")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) {
      setFavorites(data as GifFavorite[]);
      setFavoriteIds(new Set(data.map((f: any) => f.gif_id)));
    }
  }, [user]);

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
      fetchFavorites();
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setActiveCategory("Trending");
      setGifs([]);
    }
  }, [isOpen, fetchGifs, fetchFavorites]);

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
    if (cat.query === "__favorites__") return; // favorites are already loaded
    fetchGifs(cat.query);
  };

  const toggleFavorite = async (gif: GiphyGif) => {
    if (!user) return;
    const isFav = favoriteIds.has(gif.id);
    if (isFav) {
      await supabase.from("gif_favorites").delete().eq("user_id", user.id).eq("gif_id", gif.id);
      setFavoriteIds(prev => { const s = new Set(prev); s.delete(gif.id); return s; });
      setFavorites(prev => prev.filter(f => f.gif_id !== gif.id));
    } else {
      const newFav = {
        user_id: user.id,
        gif_id: gif.id,
        gif_url: gif.images.original.url,
        gif_preview_url: gif.images.fixed_width.url,
        title: gif.title || "",
      };
      const { data } = await supabase.from("gif_favorites").insert(newFav).select().single();
      if (data) {
        setFavoriteIds(prev => new Set(prev).add(gif.id));
        setFavorites(prev => [data as GifFavorite, ...prev]);
      }
    }
  };

  const removeFavoriteById = async (fav: GifFavorite) => {
    if (!user) return;
    await supabase.from("gif_favorites").delete().eq("id", fav.id);
    setFavoriteIds(prev => { const s = new Set(prev); s.delete(fav.gif_id); return s; });
    setFavorites(prev => prev.filter(f => f.id !== fav.id));
  };

  if (!isOpen) return null;

  const showFavorites = activeCategory === "Favorites";

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 mb-2 w-[420px] rounded-xl shadow-2xl border overflow-hidden animate-in fade-in-0 slide-in-from-bottom-2 duration-200 z-50"
      style={{ backgroundColor: "var(--app-bg-secondary, #2b2d31)", borderColor: "var(--app-border, #1e1f22)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--app-border, #1e1f22)" }}>
        <span className="text-sm font-bold" style={{ color: "var(--app-text-primary, #dbdee1)" }}>GIFs</span>
        <button onClick={onClose} className="transition-colors" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
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
                : ""
            }`}
            style={activeCategory !== cat.name ? { backgroundColor: "var(--app-bg-tertiary, #1e1f22)", color: "var(--app-text-secondary, #949ba4)" } : undefined}
          >
            {cat.name === "Favorites" ? "❤️ Favorites" : cat.name}
          </button>
        ))}
      </div>

      {/* GIF Grid */}
      <div className="h-[320px] overflow-y-auto px-3 pb-3">
        {showFavorites ? (
          favorites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-sm" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
              <Heart className="h-8 w-8 mb-2 opacity-40" />
              <p>No favorite GIFs yet</p>
              <p className="text-xs mt-1 opacity-60">Hover over any GIF and click ❤️ to save it</p>
            </div>
          ) : (
            <div className="columns-2 gap-2">
              {favorites.map((fav) => (
                <div key={fav.id} className="relative mb-2 w-full break-inside-avoid rounded-lg overflow-hidden group/gif">
                  <button
                    onClick={() => {
                      onSelect(fav.gif_url);
                      onClose();
                    }}
                    className="w-full hover:opacity-80 hover:scale-[1.02] transition-all duration-150 cursor-pointer"
                  >
                    <img
                      src={fav.gif_preview_url}
                      alt={fav.title}
                      className="w-full rounded-lg"
                      loading="lazy"
                    />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFavoriteById(fav); }}
                    className="absolute top-1.5 right-1.5 rounded-full p-1 opacity-0 group-hover/gif:opacity-100 transition-opacity bg-black/60 hover:bg-black/80"
                    title="Remove from favorites"
                  >
                    <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#5865f2] border-t-transparent" />
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
            No GIFs found
          </div>
        ) : (
          <div className="columns-2 gap-2">
            {gifs.map((gif) => (
              <div key={gif.id} className="relative mb-2 w-full break-inside-avoid rounded-lg overflow-hidden group/gif">
                <button
                  onClick={() => {
                    onSelect(gif.images.original.url);
                    onClose();
                  }}
                  className="w-full hover:opacity-80 hover:scale-[1.02] transition-all duration-150 cursor-pointer"
                >
                  <img
                    src={gif.images.fixed_width.url}
                    alt={gif.title}
                    className="w-full rounded-lg"
                    loading="lazy"
                  />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(gif); }}
                  className="absolute top-1.5 right-1.5 rounded-full p-1 opacity-0 group-hover/gif:opacity-100 transition-opacity bg-black/60 hover:bg-black/80"
                  title={favoriteIds.has(gif.id) ? "Remove from favorites" : "Add to favorites"}
                >
                  <Heart className={`h-4 w-4 ${favoriteIds.has(gif.id) ? "fill-red-500 text-red-500" : "text-white"}`} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Powered by GIPHY */}
      <div className="flex items-center justify-center py-2 border-t" style={{ borderColor: "var(--app-border, #1e1f22)" }}>
        <span className="text-[10px]" style={{ color: "var(--app-text-secondary, #949ba4)" }}>Powered by GIPHY</span>
      </div>
    </div>
  );
};

export default GifPicker;
