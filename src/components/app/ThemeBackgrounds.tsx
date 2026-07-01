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
      <div className="cb-hills-cloud w1" />
      <div className="cb-hills-cloud w2" />
      <div className="cb-hills-cloud w3" />
      <div className="cb-hills-moon" />
      <div className="cb-hills-fireflies" />
      <div className="cb-hills-layer h1" />
      <div className="cb-hills-layer h2" />
      <div className="cb-hills-layer h3" />
    </div>
  );
};

/** Cosmic Nebula — swirling gas clouds with drifting stars. */
export const NebulaBackground = () => {
  const { theme } = useTheme();
  if (theme !== "nebula") return null;
  return (
    <div className="cb-nebula-bg" aria-hidden="true">
      <div className="cb-nebula-glow" />
      <div className="cb-nebula-stars" />
    </div>
  );
};

/** Cyber Grid — neon horizon with scanning laser grid. */
export const CyberBackground = () => {
  const { theme } = useTheme();
  if (theme !== "cyber") return null;
  return (
    <div className="cb-cyber-bg" aria-hidden="true">
      <div className="cb-cyber-sun" />
      <div className="cb-cyber-grid" />
      <div className="cb-cyber-scan" />
    </div>
  );
};

/** Volcanic — molten cracks and rising embers. */
export const VolcanicBackground = () => {
  const { theme } = useTheme();
  if (theme !== "volcanic") return null;
  return (
    <div className="cb-volcanic-bg" aria-hidden="true">
      <div className="cb-volcanic-cracks" />
      <div className="cb-volcanic-glow" />
      <div className="cb-volcanic-embers" />
    </div>
  );
};

/** Bioluminescent — deep-sea abyss with glowing jellyfish. */
export const AbyssBackground = () => {
  const { theme } = useTheme();
  if (theme !== "abyss") return null;
  return (
    <div className="cb-abyss-bg" aria-hidden="true">
      <div className="cb-abyss-caustics" />
      <div className="cb-abyss-jelly j1" />
      <div className="cb-abyss-jelly j2" />
      <div className="cb-abyss-jelly j3" />
      <div className="cb-abyss-motes" />
    </div>
  );
};

/** Aurora Borealis — dancing curtains of light above mountains. */
export const AuroraBackground = () => {
  const { theme } = useTheme();
  if (theme !== "aurora") return null;
  return (
    <div className="cb-aurora-bg" aria-hidden="true">
      <div className="cb-aurora-stars" />
      <div className="cb-aurora-curtain c3" />
      <div className="cb-aurora-curtain c2" />
      <div className="cb-aurora-curtain" />
      <div className="cb-aurora-hills h1" />
      <div className="cb-aurora-hills h2" />
    </div>
  );
};

/** Sakura Storm — cherry blossoms swirling on wind. */
export const SakuraBackground = () => {
  const { theme } = useTheme();
  if (theme !== "sakura") return null;
  return (
    <div className="cb-sakura-bg" aria-hidden="true">
      <div className="cb-sakura-sun" />
      <div className="cb-sakura-petals" />
      <div className="cb-sakura-petals l2" />
      <div className="cb-sakura-petals l3" />
    </div>
  );
};
