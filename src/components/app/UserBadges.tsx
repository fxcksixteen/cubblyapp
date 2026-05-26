import { useEffect } from "react";
import { Sparkles, Mic, Crown, MessageCircle, Gamepad2, Moon, Heart, Star, Flower2 } from "lucide-react";
import { BadgeData, useUserBadges } from "@/contexts/UserBadgesContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// 3D badge artwork — keyed by shop_items.id. When an entry exists we render
// the artwork directly (Discord-style — no chip, just the icon). Otherwise we
// fall back to the legacy coloured chip + lucide icon so unmapped items still
// look fine.
import imgChatChampion from "@/assets/badges/chat_champion.svg";
import imgEarlySupporter from "@/assets/badges/early_supporter.svg";
import imgFriendly from "@/assets/badges/friendly.svg";
import imgGamer from "@/assets/badges/gamer.png";
import imgLegend from "@/assets/badges/legend.svg";
import imgNightOwl from "@/assets/badges/night_owl.svg";
import imgOg from "@/assets/badges/og.png";
import imgPetite from "@/assets/badges/petite.svg";
import imgVoiceVeteran from "@/assets/badges/voice_veteran.svg";

const BADGE_ART: Record<string, string> = {
  badge_chat_champ: imgChatChampion,
  badge_early_supporter: imgEarlySupporter,
  badge_friendly: imgFriendly,
  badge_gamer: imgGamer,
  badge_legend: imgLegend,
  badge_night_owl: imgNightOwl,
  badge_og: imgOg,
  badge_petite: imgPetite,
  badge_voice_veteran: imgVoiceVeteran,
};

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

/** Renders one badge — either as a 3D artwork or a fallback coloured chip. */
export const Badge = ({ badge, size = 16 }: SingleProps) => {
  const art = BADGE_ART[badge.id];
  // Render 3D art at ~1.4× the chip size so it visually matches the older
  // chip badges (the artwork has internal padding).
  const renderSize = Math.round(size * 1.4);
  if (art) {
    return (
      <img
        src={art}
        alt={badge.label}
        title={badge.label}
        draggable={false}
        className="inline-block shrink-0 align-middle select-none"
        style={{
          width: renderSize,
          height: renderSize,
          // Subtle drop shadow gives the 3D pieces a touch of depth on dark surfaces.
          filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))",
        }}
      />
    );
  }
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
