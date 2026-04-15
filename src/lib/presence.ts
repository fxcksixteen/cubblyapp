export const CUBBLY_BOT_ID = "00000000-0000-0000-0000-000000000001";

export function getEffectivePresenceStatus(
  userId: string | undefined,
  storedStatus: string | null | undefined,
  onlineUserIds: Set<string>,
) {
  if (!userId) return "offline";
  if (userId === CUBBLY_BOT_ID) return "online";
  if (!onlineUserIds.has(userId)) return "offline";
  return storedStatus === "invisible" ? "online" : storedStatus || "online";
}
