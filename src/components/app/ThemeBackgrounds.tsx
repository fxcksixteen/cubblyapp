import { useTheme } from "@/contexts/ThemeContext";

/** Sky theme — drifting clouds over a soft dusk gradient. */
export const SkyBackground = () => {
  const { theme } = useTheme();
  if (theme !== "sky") return null;
  return (
    <div className="cb-sky-bg" aria-hidden="true">
      <div className="cb-sky-cloud c1" />
      <div className="cb-sky-cloud c2" />
      <div className="cb-sky-cloud c3" />
      <div className="cb-sky-cloud c4" />
    </div>
  );
};

/** Snowy theme — three layers of falling snowflakes. */
export const SnowyBackground = () => {
  const { theme } = useTheme();
  if (theme !== "snowy") return null;
  return (
    <div className="cb-snowy-bg" aria-hidden="true">
      <div className="cb-snow-layer l1" />
      <div className="cb-snow-layer l2" />
      <div className="cb-snow-layer l3" />
    </div>
  );
};

/** Hills theme — moonlit nighttime sky with layered hill silhouettes. */
export const HillsBackground = () => {
  const { theme } = useTheme();
  if (theme !== "hills") return null;
  return (
    <div className="cb-hills-bg" aria-hidden="true">
      <div className="cb-hills-stars" />
      <div className="cb-hills-moon" />
      <div className="cb-hills-layer h1" />
      <div className="cb-hills-layer h2" />
      <div className="cb-hills-layer h3" />
    </div>
  );
};
