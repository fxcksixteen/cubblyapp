import { useEffect, CSSProperties, ReactNode } from "react";
import { useNameColors, NameColor } from "@/contexts/NameColorsContext";
import bowImg from "@/assets/badges/petite.svg";

interface Props {
  userId: string | null | undefined;
  name: string;
  className?: string;
  style?: CSSProperties;
  /** Fallback color when user has no equipped name color (e.g. friend hash color) */
  fallbackColor?: string;
  as?: "span" | "div";
  children?: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
}

/** Builds a style object for a NameColor. Animated names also need the
 *  shared `cb-animated-name` keyframes which are injected once by NameColorsStyles. */
export function nameColorStyle(c: NameColor | null, fallback?: string): CSSProperties {
  if (!c) return fallback ? { color: fallback } : {};
  if (c.kind === "static") return { color: c.color };
  if (c.kind === "gradient") {
    return {
      backgroundImage: `linear-gradient(90deg, ${c.from}, ${c.to})`,
      backgroundClip: "text",
      WebkitBackgroundClip: "text",
      color: "transparent",
      WebkitTextFillColor: "transparent",
    };
  }
  // animated
  const stops = c.stops.join(",");
  const dur = c.duration;
  const style = c.style ?? "sweep";
  const base: CSSProperties = {
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
  };
  if (style === "conic") {
    return {
      ...base,
      backgroundImage: `conic-gradient(from 0deg, ${stops})`,
      backgroundSize: "100% 100%",
      animation: `cb-animated-name-hue ${dur} linear infinite`,
    };
  }
  if (style === "hueshift") {
    return {
      ...base,
      backgroundImage: `linear-gradient(90deg, ${stops})`,
      backgroundSize: "200% 100%",
      animation: `cb-animated-name-hue ${dur} linear infinite, cb-animated-name ${dur} ease-in-out infinite`,
    };
  }
  if (style === "pulse") {
    return {
      ...base,
      backgroundImage: `linear-gradient(90deg, ${stops})`,
      backgroundSize: "300% 100%",
      animation: `cb-animated-name ${dur} ease-in-out infinite, cb-animated-name-pulse ${dur} ease-in-out infinite`,
    };
  }
  // sweep (default) — wide gradient sliding across
  return {
    ...base,
    backgroundImage: `linear-gradient(90deg, ${stops})`,
    backgroundSize: "300% 100%",
    animation: `cb-animated-name ${dur} ease-in-out infinite`,
  };
}

/** Renders a user's display name styled with their equipped name color. */
const UserDisplayName = ({
  userId,
  name,
  className,
  style,
  fallbackColor,
  as = "span",
  children,
  onClick,
}: Props) => {
  const { get, request } = useNameColors();
  useEffect(() => {
    if (userId) request(userId);
  }, [userId, request]);
  const color = get(userId);
  const iconUrl = color?.kind === "animated" ? (color as any).iconUrl as string | undefined : undefined;
  const hasBow = color?.kind === "animated" && (color as any).bow;
  const iconSrc = iconUrl || (hasBow ? bowImg : null);
  const hasIcon = !!iconSrc;
  const Tag: any = as;
  const mergedStyle: CSSProperties = { ...nameColorStyle(color, fallbackColor), ...style };
  if (hasIcon) {
    mergedStyle.position = "relative";
    mergedStyle.display = "inline-block";
    mergedStyle.overflow = "visible";
    mergedStyle.paddingTop = iconUrl ? "0.45em" : "0.35em";
  }
  return (
    <Tag className={className} style={mergedStyle} onClick={onClick}>
      {children ?? name}
      {iconSrc && (
        <img
          src={iconSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            position: "absolute",
            top: iconUrl ? "-0.1em" : "0.2em",
            left: iconUrl ? "-0.55em" : "-0.15em",
            height: iconUrl ? "1.05em" : "0.75em",
            width: "auto",
            pointerEvents: "none",
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))",
            transform: iconUrl ? "none" : "rotate(-18deg)",
            transformOrigin: "bottom left",
            zIndex: 2,
          }}
        />
      )}
    </Tag>
  );
};

/** Inject the animation keyframes once at app root. */
export const NameColorsStyles = () => (
  <style>{`
    @keyframes cb-animated-name {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes cb-animated-name-hue {
      from { filter: hue-rotate(0deg); }
      to   { filter: hue-rotate(360deg); }
    }
    @keyframes cb-animated-name-pulse {
      0%, 100% { filter: brightness(1) contrast(1); }
      50%      { filter: brightness(1.35) contrast(1.15); }
    }
  `}</style>
);

export default UserDisplayName;
