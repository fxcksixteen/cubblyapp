import { useEffect } from "react";
import { Sparkles, Mic, Crown, MessageCircle, Gamepad2, Moon, Heart, Star, Flower2 } from "lucide-react";
import { BadgeData, useUserBadges } from "@/contexts/UserBadgesContext";

const ICONS: Record<string, any> = {
  sparkles: Sparkles,
  mic: Mic,
  crown: Crown,
  message_circle: MessageCircle,
  gamepad: Gamepad2,
  moon: Moon,
  heart: Heart,
  star: Star,
  flower: Flower2,
};

interface SingleProps {
  badge: BadgeData;
  size?: number;
}

/** Renders one badge as a small rounded chip with icon. */
export const Badge = ({ badge, size = 16 }: SingleProps) => {
  const Icon = ICONS[badge.icon] ?? Star;
  return (
    <span
      title={badge.label}
      className="inline-flex items-center justify-center rounded-md shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: badge.bg,
        color: badge.fg,
        boxShadow: badge.glow ? `0 0 6px ${badge.glow}55` : undefined,
      }}
    >
      <Icon style={{ width: size * 0.7, height: size * 0.7 }} strokeWidth={2.5} />
    </span>
  );
};

interface RowProps {
  userId: string | null | undefined;
  size?: number;
  className?: string;
}

/** Renders the equipped-badge row for a user (lazily loaded). */
const UserBadges = ({ userId, size = 16, className }: RowProps) => {
  const { get, request } = useUserBadges();
  useEffect(() => {
    if (userId) request(userId);
  }, [userId, request]);
  const badges = get(userId);
  if (!badges.length) return null;
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className ?? ""}`}>
      {badges.map((b) => (
        <Badge key={b.id} badge={b} size={size} />
      ))}
    </span>
  );
};

export default UserBadges;
