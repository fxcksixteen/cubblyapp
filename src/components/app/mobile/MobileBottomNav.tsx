import { useNavigate, useLocation } from "react-router-dom";
import { useFriends } from "@/hooks/useFriends";
import { useAuth } from "@/contexts/AuthContext";
import friendsIcon from "@/assets/icons/friends.svg";
import messagesIcon from "@/assets/icons/messages.svg";
import shopIcon from "@/assets/icons/shop.svg";
import { User } from "lucide-react";

const tabs = [
  { id: "home", label: "Home", route: "/@me/online", matches: ["online", "all", "chat"], icon: messagesIcon, iconType: "img" as const },
  { id: "friends", label: "Friends", route: "/@me/all", matches: ["pending", "blocked", "add"], icon: friendsIcon, iconType: "img" as const },
  { id: "shop", label: "Shop", route: "/@me/shop", matches: ["shop"], icon: shopIcon, iconType: "img" as const },
  { id: "you", label: "You", route: "/@me/you", matches: ["you"], icon: null, iconType: "lucide" as const },
];

interface Props {
  /** Hide the nav (e.g. while inside a chat to maximize space) */
  hidden?: boolean;
}

const MobileBottomNav = ({ hidden }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { pending } = useFriends();
  const incomingPendingCount = pending.filter((p) => p.addressee_id === user?.id).length;
  const parts = location.pathname.split("/").filter(Boolean);
  const seg = parts[1] || "online";

  // Determine active tab based on path
  const activeId = (() => {
    if (parts.includes("you")) return "you";
    if (parts.includes("shop")) return "shop";
    if (["pending", "blocked", "add", "all"].includes(seg)) return "friends";
    return "home"; // default: online + chat + everything else
  })();

  if (hidden) return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch border-t"
      style={{
        backgroundColor: "var(--app-bg-secondary)",
        borderColor: "var(--app-border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {tabs.map((t) => {
        const isActive = activeId === t.id;
        return (
          <button
            key={t.id}
            onClick={() => navigate(t.route, { replace: true })}
            className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 active:opacity-60 transition-opacity touch-manipulation"
            aria-current={isActive ? "page" : undefined}
          >
            {t.iconType === "img" && t.icon ? (
              <img
                src={t.icon}
                alt=""
                className="h-6 w-6"
                style={{
                  filter: isActive
                    ? "brightness(0) saturate(100%) invert(58%) sepia(90%) saturate(580%) hue-rotate(360deg) brightness(95%) contrast(95%)"
                    : "brightness(0) invert(0.6)",
                }}
              />
            ) : (
              <User
                className="h-6 w-6"
                style={{ color: isActive ? "hsl(var(--primary))" : "var(--app-text-secondary)" }}
              />
            )}
            <span
              className="text-[10px] font-semibold"
              style={{ color: isActive ? "hsl(var(--primary))" : "var(--app-text-secondary)" }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default MobileBottomNav;
