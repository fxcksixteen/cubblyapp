import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PreviewData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

// Session-level in-memory cache keyed by URL so scrolling chat history doesn't
// re-fetch the same OG metadata over and over.
const cache = new Map<string, PreviewData | null>();

interface LinkPreviewProps {
  url: string;
}

const LinkPreview = ({ url }: LinkPreviewProps) => {
  const [data, setData] = useState<PreviewData | null | undefined>(() =>
    cache.has(url) ? cache.get(url) : undefined,
  );

  useEffect(() => {
    if (cache.has(url)) {
      setData(cache.get(url) ?? null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: res, error } = await supabase.functions.invoke("link-preview", {
          body: { url },
        });
        if (cancelled) return;
        if (error || !res) {
          cache.set(url, null);
          setData(null);
          return;
        }
        const preview: PreviewData = { ...res, url };
        cache.set(url, preview);
        setData(preview);
      } catch {
        if (!cancelled) {
          cache.set(url, null);
          setData(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // No preview available — render nothing (link is still clickable in the message).
  if (data === null) return null;
  // Loading skeleton: keep it tiny so it doesn't shift layout much.
  if (data === undefined) {
    return (
      <div
        className="mt-1.5 max-w-[420px] rounded-lg border-l-4 p-3 animate-pulse"
        style={{
          borderLeftColor: "var(--app-text-secondary, #6d6f78)",
          backgroundColor: "var(--app-bg-secondary, #2b2d31)",
        }}
      >
        <div className="h-3 w-1/3 rounded bg-[#3f4147]" />
        <div className="mt-2 h-3 w-2/3 rounded bg-[#3f4147]" />
      </div>
    );
  }

  if (!data.title && !data.description && !data.image) return null;

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="mt-1.5 block max-w-[420px] rounded-lg border-l-4 overflow-hidden transition-colors"
      style={{
        borderLeftColor: "#00a8fc",
        backgroundColor: "var(--app-bg-secondary, #2b2d31)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-hover, #32353b)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--app-bg-secondary, #2b2d31)")}
    >
      <div className="p-3">
        {data.siteName && (
          <p className="text-[11px] font-medium mb-1" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
            {data.siteName}
          </p>
        )}
        {data.title && (
          <p className="text-sm font-semibold leading-snug text-[#00a8fc] line-clamp-2">
            {data.title}
          </p>
        )}
        {data.description && (
          <p
            className="text-xs mt-1 leading-snug line-clamp-3"
            style={{ color: "var(--app-text-secondary, #b5bac1)" }}
          >
            {data.description}
          </p>
        )}
        {data.image && (
          <img
            src={data.image}
            alt=""
            className="mt-2 max-h-[200px] w-full rounded object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}
      </div>
    </a>
  );
};

export default LinkPreview;
