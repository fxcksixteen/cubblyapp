import { useTheme } from "@/contexts/ThemeContext";

/** Animated star-field background rendered when the Space theme is active. */
const SpaceBackground = () => {
  const { theme } = useTheme();
  if (theme !== "space") return null;
  return (
    <div className="cb-space-bg" aria-hidden="true">
      <div className="cb-space-stars" />
      <div className="cb-space-stars-2" />
      <div className="cb-space-stars-3" />
      <div className="cb-shooting-star s1" />
      <div className="cb-shooting-star s2" />
      <div className="cb-shooting-star s3" />
      <div className="cb-shooting-star s4" />
    </div>
  );
};

export default SpaceBackground;
