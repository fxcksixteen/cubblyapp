import { useEffect, CSSProperties, ReactNode } from "react";
import { useNameColors, NameColor } from "@/contexts/NameColorsContext";

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
  return {
    backgroundImage: `linear-gradient(90deg, ${c.stops.join(",")})`,
    backgroundSize: "300% 100%",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    animation: `cb-animated-name ${c.duration} ease-in-out infinite`,
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
  const Tag: any = as;
  return (
    <Tag className={className} style={{ ...nameColorStyle(color, fallbackColor), ...style }} onClick={onClick}>
      {children ?? name}
    </Tag>
  );
};

/** Inject the animation keyframes once at app root. */
export const NameColorsStyles = () => (
  <style>{`@keyframes cb-animated-name {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }`}</style>
);

export default UserDisplayName;
