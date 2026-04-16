import { Conversation } from "@/hooks/useConversations";
import { getProfileColor } from "@/lib/profileColors";

interface GroupAvatarProps {
  conversation: Conversation;
  size?: number;
  className?: string;
}

/**
 * Renders the avatar for a conversation:
 *  - DM → the other user's avatar (or color fallback with their initial)
 *  - Group with picture_url → that picture
 *  - Group without picture → a stacked grid of up to 4 member avatars/initials
 */
const GroupAvatar = ({ conversation, size = 32, className = "" }: GroupAvatarProps) => {
  // DM → single avatar
  if (!conversation.is_group) {
    const p = conversation.participant;
    if (p.avatar_url) {
      return (
        <img
          src={p.avatar_url}
          alt=""
          className={`rounded-full object-cover ${className}`}
          style={{ width: size, height: size }}
        />
      );
    }
    const color = getProfileColor(p.user_id);
    return (
      <div
        className={`flex items-center justify-center rounded-full font-bold text-white ${className}`}
        style={{
          width: size,
          height: size,
          backgroundColor: color.bg,
          fontSize: Math.max(10, size * 0.45),
        }}
      >
        {p.display_name.charAt(0).toUpperCase()}
      </div>
    );
  }

  // Group → custom picture
  if (conversation.picture_url) {
    return (
      <img
        src={conversation.picture_url}
        alt=""
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Group with no picture → tiled member avatars
  const tiles = conversation.members.slice(0, 4);
  if (tiles.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-full font-bold text-white ${className}`}
        style={{ width: size, height: size, backgroundColor: "#5865f2", fontSize: Math.max(10, size * 0.45) }}
      >
        #
      </div>
    );
  }

  if (tiles.length === 1) {
    const m = tiles[0];
    if (m.avatar_url) {
      return (
        <img
          src={m.avatar_url}
          alt=""
          className={`rounded-full object-cover ${className}`}
          style={{ width: size, height: size }}
        />
      );
    }
    const color = getProfileColor(m.user_id);
    return (
      <div
        className={`flex items-center justify-center rounded-full font-bold text-white ${className}`}
        style={{ width: size, height: size, backgroundColor: color.bg, fontSize: Math.max(10, size * 0.45) }}
      >
        {m.display_name.charAt(0).toUpperCase()}
      </div>
    );
  }

  // 2+ → grid layout inside a circle
  return (
    <div
      className={`relative rounded-full overflow-hidden ${className}`}
      style={{ width: size, height: size, backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}
    >
      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: tiles.length >= 2 ? "1fr 1fr" : "1fr",
          gridTemplateRows: tiles.length >= 3 ? "1fr 1fr" : "1fr",
        }}
      >
        {tiles.map((m, i) => {
          const color = getProfileColor(m.user_id);
          return m.avatar_url ? (
            <img key={i} src={m.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              key={i}
              className="flex h-full w-full items-center justify-center font-bold text-white"
              style={{ backgroundColor: color.bg, fontSize: Math.max(8, size * 0.3) }}
            >
              {m.display_name.charAt(0).toUpperCase()}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GroupAvatar;
